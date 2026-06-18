import type { SupabaseClient } from "@supabase/supabase-js";

// Enriquecimento de anúncio: pega nome de campanha/conjunto/anúncio + criativo
// (título, texto, miniatura) na Marketing API (ads_read) e cacheia por ad_id.
// A miniatura do Meta (fbcdn) EXPIRA em dias → baixamos e servimos do Storage.

const GRAPH = process.env.META_GRAPH_VERSION || "v21.0"; // || (não ??): env vazia também cai no default
const BUCKET = "ad-thumbnails";
const STALE_MS = 24 * 60 * 60 * 1000; // re-busca o cache depois de 1 dia

export type AdCreative = {
  ad_id: string;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  title: string | null;
  body: string | null;
  image_path: string | null;
  permalink: string | null;
  effective_status: string | null;
  fetched_at: string;
};

type GraphAd = {
  name?: string;
  effective_status?: string;
  adset?: { name?: string };
  campaign?: { name?: string };
  creative?: {
    thumbnail_url?: string;
    image_url?: string;
    title?: string;
    body?: string;
    instagram_permalink_url?: string;
    object_story_spec?: {
      link_data?: { picture?: string };
      video_data?: { image_url?: string };
    };
  };
};

// melhor imagem disponível: poster cheio do criativo > thumbnail pequena.
function bestImage(c: GraphAd["creative"]): string | undefined {
  return (
    c?.image_url ||
    c?.object_story_spec?.video_data?.image_url ||
    c?.object_story_spec?.link_data?.picture ||
    c?.thumbnail_url
  );
}

async function fetchFromMeta(adId: string): Promise<GraphAd | null> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) return null;
  const fields =
    "name,effective_status,adset{name},campaign{name}," +
    "creative{thumbnail_url,image_url,title,body,instagram_permalink_url,object_story_spec}";
  const url = `https://graph.facebook.com/${GRAPH}/${adId}?fields=${encodeURIComponent(fields)}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error("[meta-ads] fetch falhou:", adId, res.status);
      return null;
    }
    return (await res.json()) as GraphAd;
  } catch (e) {
    console.error("[meta-ads] erro fetch:", e);
    return null;
  }
}

// Baixa a imagem do criativo e sobe pro Storage → URL pública permanente.
async function storeThumbnail(
  sb: SupabaseClient,
  adId: string,
  imageUrl: string | undefined,
): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";
    const buf = Buffer.from(await res.arrayBuffer());
    const path = `${adId}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType, upsert: true });
    if (error) {
      console.error("[meta-ads] upload storage falhou:", error.message);
      return null;
    }
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("[meta-ads] erro thumbnail:", e);
    return null;
  }
}

// Busca na Meta + grava no cache (best-effort — nunca lança).
export async function cacheAdCreative(sb: SupabaseClient, adId: string): Promise<void> {
  if (!adId) return;
  const ad = await fetchFromMeta(adId);
  if (!ad) return;
  const imagePath = await storeThumbnail(sb, adId, bestImage(ad.creative));
  await sb.from("ad_creatives").upsert(
    {
      ad_id: adId,
      ad_name: ad.name ?? null,
      adset_name: ad.adset?.name ?? null,
      campaign_name: ad.campaign?.name ?? null,
      title: ad.creative?.title ?? null,
      body: ad.creative?.body ?? null,
      image_path: imagePath,
      permalink: ad.creative?.instagram_permalink_url ?? null,
      effective_status: ad.effective_status ?? null,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "ad_id" },
  );
}

// Lê do cache; se faltar ou estiver velho, atualiza na hora. Pra views únicas (tela do lead).
export async function getAdCreative(sb: SupabaseClient, adId: string | null): Promise<AdCreative | null> {
  if (!adId) return null;
  const { data } = await sb.from("ad_creatives").select("*").eq("ad_id", adId).maybeSingle();
  const stale = !data || Date.now() - new Date(data.fetched_at as string).getTime() > STALE_MS;
  if (stale) {
    await cacheAdCreative(sb, adId);
    const { data: fresh } = await sb.from("ad_creatives").select("*").eq("ad_id", adId).maybeSingle();
    return (fresh ?? data ?? null) as AdCreative | null;
  }
  return data as AdCreative;
}

// ── Performance / financeiro (central de comando, alongside Ads Manager) ──

export type AccountFinance = {
  currency: string;
  balanceText: string | null; // "Saldo disponível (R$217,39 BRL)"
  balanceValue: number | null; // 217.39
  spendCap: number | null; // R$ (campos de conta vêm em centavos → /100)
  amountSpent: number | null;
  status: number;
};

export async function getAccountFinance(): Promise<AccountFinance | null> {
  const token = process.env.META_ADS_TOKEN;
  const act = process.env.META_AD_ACCOUNT_ID;
  if (!token || !act) return null;
  const url = `https://graph.facebook.com/${GRAPH}/${act}?fields=currency,account_status,spend_cap,amount_spent,funding_source_details`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      currency?: string;
      account_status?: number;
      spend_cap?: string;
      amount_spent?: string;
      funding_source_details?: { display_string?: string };
    };
    const text = d.funding_source_details?.display_string ?? null;
    const m = text?.match(/([\d.]+,\d{2})/);
    const balanceValue = m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : null;
    return {
      currency: d.currency ?? "BRL",
      balanceText: text,
      balanceValue,
      spendCap: d.spend_cap ? Number(d.spend_cap) / 100 : null,
      amountSpent: d.amount_spent ? Number(d.amount_spent) / 100 : null,
      status: d.account_status ?? 0,
    };
  } catch {
    return null;
  }
}

export type AdPerf = {
  adId: string;
  adName: string | null;
  adsetName: string | null;
  campaignName: string | null;
  spend: number; // R$ (insights já vêm em unidade da moeda)
  impressions: number;
  conversations: number; // conversas iniciadas (messaging)
};

// Insights por anúncio no período (ads_read). datePreset: today|last_7d|last_30d|...
export async function getAdsPerformance(datePreset = "last_30d"): Promise<AdPerf[]> {
  const token = process.env.META_ADS_TOKEN;
  const act = process.env.META_AD_ACCOUNT_ID;
  if (!token || !act) return [];
  const fields = "ad_id,ad_name,adset_name,campaign_name,spend,impressions,actions";
  const url = `https://graph.facebook.com/${GRAPH}/${act}/insights?level=ad&fields=${fields}&date_preset=${datePreset}&limit=300`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: {
        ad_id?: string;
        ad_name?: string;
        adset_name?: string;
        campaign_name?: string;
        spend?: string;
        impressions?: string;
        actions?: { action_type: string; value: string }[];
      }[];
    };
    return (json.data ?? []).map((r) => {
      const conv = (r.actions ?? [])
        .filter((a) => a.action_type.includes("messaging_conversation_started"))
        .reduce((s, a) => s + Number(a.value || 0), 0);
      return {
        adId: r.ad_id ?? "",
        adName: r.ad_name ?? null,
        adsetName: r.adset_name ?? null,
        campaignName: r.campaign_name ?? null,
        spend: Number(r.spend || 0),
        impressions: Number(r.impressions || 0),
        conversations: conv,
      };
    });
  } catch {
    return [];
  }
}

// Lê vários do cache de uma vez, SEM refresh (rápido, pra listas). Map ad_id -> criativo.
export async function getAdCreatives(
  sb: SupabaseClient,
  adIds: (string | null | undefined)[],
): Promise<Map<string, AdCreative>> {
  const ids = [...new Set(adIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return new Map();
  const { data } = await sb.from("ad_creatives").select("*").in("ad_id", ids);
  return new Map((data ?? []).map((r) => [r.ad_id as string, r as AdCreative]));
}

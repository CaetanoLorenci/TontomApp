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

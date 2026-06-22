import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { advanceStage, extractValue } from "@/lib/conversion";
import { cacheAdCreative } from "@/lib/meta-ads";
import { sendPushToOrgs } from "@/lib/push";
import {
  cloudText,
  type CloudWebhook,
  type CloudValue,
  type CloudMessage,
  type CloudReferral,
} from "@/lib/cloud-whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────
// Webhook da WhatsApp Cloud API OFICIAL (WABA).
// GET  = verificação do webhook (Meta manda hub.challenge).
// POST = mensagens. Inbound de anúncio CTWA traz referral.ctwa_clid NATIVO
//        → atribuição exata + conversão oficial (business_messaging).
// Coexistência: mensagens do time no app chegam em value.message_echoes.
// ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  if (sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") === verify) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  let body: CloudWebhook;
  try {
    body = (await req.json()) as CloudWebhook;
  } catch {
    return NextResponse.json({ ok: true, ignored: "invalid json" });
  }

  const sb = supabaseAdmin();
  try {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        await handleValue(sb, change.value);
      }
    }
  } catch (e) {
    console.error("[cloud-webhook] erro:", e);
  }
  // Sempre 200 rápido — a Meta reenvia se não receber 200.
  return NextResponse.json({ ok: true });
}

type SB = ReturnType<typeof supabaseAdmin>;

async function handleValue(sb: SB, value: CloudValue | undefined) {
  if (!value) return;

  const nameByWaId = new Map<string, string>();
  for (const c of value.contacts ?? []) {
    if (c.wa_id && c.profile?.name) nameByWaId.set(c.wa_id, c.profile.name);
  }

  // mensagens recebidas (do lead)
  for (const m of value.messages ?? []) {
    await handleIncoming(sb, m, nameByWaId.get(m.from) ?? null);
  }

  // mensagens enviadas pelo time no app (coexistência) → gatilhos
  for (const m of value.message_echoes ?? []) {
    await handleEcho(sb, m);
  }
}

/* ── mensagem do LEAD: cria/atribui (CTWA nativo) + salva ── */
async function handleIncoming(sb: SB, m: CloudMessage, name: string | null) {
  const phone = m.from?.replace(/\D/g, "");
  if (!phone) return;
  const text = cloudText(m);

  const { data: existing } = await sb
    .from("leads")
    .select("id, click_id")
    .eq("phone", phone)
    .maybeSingle();

  let leadId = existing?.id ?? null;
  const click = m.referral?.ctwa_clid ? await upsertCtwaClick(sb, m.referral) : null;

  if (existing) {
    // re-atribuição last-touch quando volta por um anúncio novo
    if (click && click.id !== existing.click_id) {
      await sb
        .from("leads")
        .update({ click_id: click.id, code: click.code, attributed_via: "ctwa", updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
  } else {
    const { data: created, error } = await sb
      .from("leads")
      .insert({
        phone,
        name,
        first_message: text,
        code: click?.code ?? null,
        click_id: click?.id ?? null,
        attributed_via: click ? "ctwa" : null,
        stage: "novo",
      })
      .select("id")
      .single();
    if (error) {
      console.error("[cloud-webhook] falha ao criar lead:", error.message);
      return;
    }
    leadId = created.id;
  }

  // raw debug: guarda o objeto cru da mensagem (inclui referral) p/ inspeção
  await saveMessage(sb, leadId, phone, "in", text, m.id, m as unknown as Record<string, unknown>);

  // notifica o time (push): lead aguardando resposta
  if (leadId) await notifyNewMessage(sb, leadId, name, phone, text);
}

/* Push pro time quando um lead manda mensagem (notifica Amplia + a org do lead). */
async function notifyNewMessage(sb: SB, leadId: string, name: string | null, phone: string, text: string | null) {
  try {
    const { data: lead } = await sb.from("leads").select("org_id, name").eq("id", leadId).maybeSingle();
    const org = lead?.org_id ?? "amplia";
    const who = lead?.name ?? name ?? `+${phone}`;
    const snippet = text ? (text.length > 80 ? text.slice(0, 80) + "…" : text) : "enviou uma mensagem";
    await sendPushToOrgs(["amplia", org], {
      title: `💬 ${who}`,
      body: snippet,
      url: `/painel/lead/${leadId}`,
      tag: `lead-${leadId}`,
    });
  } catch (e) {
    console.error("[cloud-webhook] push falhou:", e);
  }
}

/* ── mensagem do TIME (echo da coexistência): salva + roda gatilhos ── */
async function handleEcho(sb: SB, m: CloudMessage) {
  // ⚠️ formato exato do echo de coexistência será confirmado no onboarding real
  // (mesma disciplina do Z-API: validar com payload de verdade). recipient = m.from? to?
  const phone = (m.from ?? "").replace(/\D/g, "");
  const text = cloudText(m);
  if (!phone || !text) return;

  const { data: lead } = await sb.from("leads").select("id, stage").eq("phone", phone).maybeSingle();
  if (!lead) return;

  await saveMessage(sb, lead.id, phone, "out", text, m.id);

  const { data: triggers } = await sb
    .from("stage_triggers")
    .select("stage, phrase")
    .eq("active", true)
    .eq("direction", "out");
  const low = text.toLowerCase();
  const hit = (triggers ?? []).find((t) => low.includes(t.phrase.toLowerCase()));
  if (!hit) return;

  const value = hit.stage === "vendido" ? extractValue(text) : null;
  await advanceStage(lead.id, hit.stage, value, { onlyForward: true, source: "trigger" });
}

/* click sintético pra um anúncio CTWA (1 por ctwa_clid) */
async function upsertCtwaClick(sb: SB, ref: CloudReferral): Promise<{ id: string; code: string } | null> {
  const clid = ref.ctwa_clid!;
  const { data: found } = await sb.from("clicks").select("id, code").eq("ctwa_clid", clid).maybeSingle();
  if (found) return found;

  const { data: created, error } = await sb
    .from("clicks")
    .insert({
      code: `CT-${clid.slice(-8).toUpperCase()}`,
      ctwa_clid: clid,
      ad_id: ref.source_id ?? null,
      utm_source: "ctwa",
      utm_campaign: ref.headline ?? `anúncio ${ref.source_id ?? ""}`.trim(),
      utm_content: ref.body ?? null,
    })
    .select("id, code")
    .single();
  if (error) {
    console.error("[cloud-webhook] falha ao criar click ctwa:", error.message);
    return null;
  }
  // cacheia o criativo do anúncio (nome de campanha/conjunto + miniatura) pro card do painel.
  // best-effort: nunca lança e não bloqueia a atribuição se a Marketing API falhar.
  if (ref.source_id) await cacheAdCreative(sb, ref.source_id);
  return created;
}

async function saveMessage(
  sb: SB,
  leadId: string | null,
  phone: string,
  direction: "in" | "out",
  content: string | null,
  wamid: string,
  raw?: Record<string, unknown>,
) {
  const { error } = await sb
    .from("messages")
    .insert({ lead_id: leadId, phone, direction, content, zapi_message_id: wamid, raw: raw ?? null });
  if (error && !error.message.includes("duplicate")) {
    console.error("[cloud-webhook] falha ao salvar mensagem:", error.message);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { extractCode, stripInvisible } from "@/lib/code";
import { advanceStage, extractValue } from "@/lib/conversion";
import { DEFAULT_TEMPLATE } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Webhook do Z-API — configurar DOIS callbacks pra esta mesma URL:
//   "Ao receber"  → mensagens do lead   (atribuição por código)
//   "Ao enviar"   → mensagens do time   (gatilhos automáticos de conversão)
// URL: https://<app>/api/webhook/zapi?secret=<WEBHOOK_SECRET>
//
// Fluxo: salva TODA mensagem no nosso banco → recebida: atribui origem pelo código
// → enviada: se bater frase-gatilho, avança estágio e dispara CAPI sozinho.
export async function POST(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.nextUrl.searchParams.get("secret") !== secret) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  let body: ZapiMessage;
  try {
    body = (await req.json()) as ZapiMessage;
  } catch {
    return NextResponse.json({ ok: true, ignored: "invalid json" });
  }

  // recibo de entrega/status NÃO é mensagem (vem sem texto) — só o ReceivedCallback interessa
  if (body.type && body.type !== "ReceivedCallback") {
    return NextResponse.json({ ok: true, ignored: body.type });
  }

  // grupo/broadcast/newsletter não é lead — sem isso, mensagem de grupo viraria lead fantasma
  if (body.isGroup || body.isNewsletter || body.broadcast) {
    return NextResponse.json({ ok: true, ignored: "group/broadcast" });
  }

  const phone = body.phone?.replace(/\D/g, "");
  if (!phone) return NextResponse.json({ ok: true, ignored: "no phone" });

  const message = extractText(body);
  const sb = supabaseAdmin();

  try {
    if (body.fromMe) {
      return NextResponse.json(await handleOutgoing(sb, phone, message, body));
    }
    return NextResponse.json(await handleIncoming(sb, phone, message, body));
  } catch (e) {
    console.error("[webhook] erro inesperado:", e);
    return NextResponse.json({ ok: true });
  }
}

type SB = ReturnType<typeof supabaseAdmin>;

/* ── mensagem do LEAD: cria/atribui + salva ── */
async function handleIncoming(sb: SB, phone: string, message: string | null, body: ZapiMessage) {
  const code = extractCode(message);

  const { data: existing } = await sb
    .from("leads")
    .select("id, click_id")
    .eq("phone", phone)
    .maybeSingle();

  let leadId = existing?.id ?? null;

  if (existing) {
    // Lead voltou por anúncio? Re-atribui (last-touch). Prioridade: CTWA nativo > código > janela.
    let click = await resolveCtwaClick(sb, body);
    let via: "ctwa" | "codigo" | "janela" | null = click ? "ctwa" : null;
    if (!click && code) {
      click = await findClick(sb, code);
      if (click) via = "codigo";
    }
    if (!click && isTemplateMessage(message)) {
      click = await findOrphanClickInWindow(sb);
      if (click) via = "janela";
    }
    if (click && click.id !== existing.click_id) {
      await sb
        .from("leads")
        .update({
          click_id: click.id,
          code: click.code,
          attributed_via: via,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }
  } else {
    // Prioridade de atribuição:
    // 1º CTWA nativo (externalAdReply do anúncio de WhatsApp — exato, sem redirect)
    // 2º código exato (zero-width que sobreviveu, ex: desktop)
    // 3º janela de tempo — SÓ se a mensagem for a do anúncio (orgânico não rouba clique)
    let click = await resolveCtwaClick(sb, body);
    let via: "ctwa" | "codigo" | "janela" | null = click ? "ctwa" : null;
    if (!click && code) {
      click = await findClick(sb, code);
      if (click) via = "codigo";
    }
    if (!click && isTemplateMessage(message)) {
      click = await findOrphanClickInWindow(sb);
      if (click) via = "janela";
    }
    const { data: created, error } = await sb
      .from("leads")
      .insert({
        phone,
        name: body.senderName ?? body.chatName ?? null,
        first_message: message,
        code: click?.code ?? null,
        click_id: click?.id ?? null,
        attributed_via: via,
        stage: "novo",
      })
      .select("id")
      .single();
    if (error) {
      console.error("[webhook] falha ao criar lead:", error.message);
      return { ok: true, error: error.message };
    }
    leadId = created.id;
  }

  await saveMessage(sb, { leadId, phone, direction: "in", content: message, zapiId: body.messageId });
  return { ok: true, lead: leadId, direction: "in" };
}

/* ── mensagem do TIME: salva + roda gatilhos de conversão ── */
async function handleOutgoing(sb: SB, phone: string, message: string | null, body: ZapiMessage) {
  const { data: lead } = await sb
    .from("leads")
    .select("id, stage")
    .eq("phone", phone)
    .maybeSingle();

  // conversa que não é lead (ex: você falando com fornecedor) → ignora
  if (!lead) return { ok: true, ignored: "not a lead" };

  await saveMessage(sb, { leadId: lead.id, phone, direction: "out", content: message, zapiId: body.messageId });

  if (!message) return { ok: true, lead: lead.id, direction: "out" };

  // gatilhos ativos (frases que o time manda → avanço automático)
  const { data: triggers } = await sb
    .from("stage_triggers")
    .select("stage, phrase")
    .eq("active", true)
    .eq("direction", "out");

  const text = message.toLowerCase();
  const hit = (triggers ?? []).find((t) => text.includes(t.phrase.toLowerCase()));
  if (!hit) return { ok: true, lead: lead.id, direction: "out" };

  const value = hit.stage === "vendido" ? extractValue(message) : null;
  const result = await advanceStage(lead.id, hit.stage, value, {
    onlyForward: true, // automação nunca rebaixa estágio
    source: "trigger",
  });

  return { ok: true, lead: lead.id, direction: "out", trigger: hit.stage, result };
}

async function saveMessage(
  sb: SB,
  m: { leadId: string | null; phone: string; direction: "in" | "out"; content: string | null; zapiId?: string },
) {
  const { error } = await sb.from("messages").insert({
    lead_id: m.leadId,
    phone: m.phone,
    direction: m.direction,
    content: m.content,
    zapi_message_id: m.zapiId ?? null,
  });
  // duplicata de webhook (retry do Z-API) cai no índice único — ok ignorar
  if (error && !error.message.includes("duplicate")) {
    console.error("[webhook] falha ao salvar mensagem:", error.message);
  }
}

async function findClick(sb: SB, code: string): Promise<{ id: string; code: string } | null> {
  const { data } = await sb.from("clicks").select("id, code").eq("code", code).maybeSingle();
  return data ?? null;
}

// ── CTWA nativo: mensagem veio de anúncio de WhatsApp? ──
// O Z-API entrega externalAdReply {ctwaClid, sourceId, title...} na 1ª mensagem.
// Criamos um "click" sintético com o ctwa_clid → atribuição exata, e o CAPI
// devolve o evento como business_messaging (otimização nativa do Meta).
async function resolveCtwaClick(sb: SB, body: ZapiMessage): Promise<{ id: string; code: string } | null> {
  const ad =
    body.externalAdReply ??
    body.text?.externalAdReply ??
    body.message?.externalAdReply ??
    null;
  if (!ad?.ctwaClid) return null;

  // 1 click por ctwaClid (retry de webhook não duplica)
  const { data: existing } = await sb
    .from("clicks")
    .select("id, code")
    .eq("ctwa_clid", ad.ctwaClid)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await sb
    .from("clicks")
    .insert({
      code: `CT-${ad.ctwaClid.slice(-8).toUpperCase()}`,
      ctwa_clid: ad.ctwaClid,
      ad_id: ad.sourceId ?? null,
      utm_source: "ctwa",
      utm_campaign: ad.title ?? `anúncio ${ad.sourceId ?? ""}`.trim(),
      utm_content: ad.body ?? null,
    })
    .select("id, code")
    .single();
  if (error) {
    console.error("[webhook] falha ao criar click ctwa:", error.message);
    return null;
  }
  return created;
}

// A mensagem recebida é a pré-preenchida do anúncio? (ignora invisíveis e espaços)
function isTemplateMessage(message: string | null): boolean {
  if (!message) return false;
  return stripInvisible(message).trim() === DEFAULT_TEMPLATE.trim();
}

// Fallback de atribuição por JANELA DE TEMPO: o clique mais recente (até 10 min)
// que ainda não foi casado com nenhum lead. Funciona bem em volume baixo;
// pode errar se 2 leads clicam quase juntos — por isso fica marcado 'janela'.
const ATTRIBUTION_WINDOW_MIN = 10;

async function findOrphanClickInWindow(sb: SB): Promise<{ id: string; code: string } | null> {
  const cutoff = new Date(Date.now() - ATTRIBUTION_WINDOW_MIN * 60_000).toISOString();
  const { data: clicks } = await sb
    .from("clicks")
    .select("id, code, leads(id)")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(10);
  const orphan = (clicks ?? []).find(
    (c) => !c.leads || (Array.isArray(c.leads) && c.leads.length === 0),
  );
  return orphan ? { id: orphan.id, code: orphan.code } : null;
}

// Z-API manda o conteúdo em campos diferentes por tipo de mensagem.
function extractText(b: ZapiMessage): string | null {
  return (
    b.text?.message ??
    b.image?.caption ??
    b.video?.caption ??
    b.document?.caption ??
    b.buttonsResponseMessage?.message ??
    b.listResponseMessage?.message ??
    null
  );
}

// Shape parcial do payload do Z-API (só o que usamos).
type ExternalAdReply = {
  ctwaClid?: string;
  sourceId?: string;
  sourceUrl?: string;
  sourceType?: string;
  title?: string;
  body?: string;
};

type ZapiMessage = {
  type?: string; // ReceivedCallback | DeliveryCallback | MessageStatusCallback ...
  phone?: string;
  messageId?: string;
  senderName?: string;
  chatName?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  isNewsletter?: boolean;
  broadcast?: boolean;
  externalAdReply?: ExternalAdReply;
  text?: { message?: string; externalAdReply?: ExternalAdReply };
  message?: { externalAdReply?: ExternalAdReply };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string };
  buttonsResponseMessage?: { message?: string };
  listResponseMessage?: { message?: string };
};

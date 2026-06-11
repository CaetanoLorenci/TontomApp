import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { extractCode } from "@/lib/code";
import { advanceStage, extractValue } from "@/lib/conversion";

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
    // atribuição tardia: ainda sem origem e agora veio código
    if (!existing.click_id && code) {
      const click = await findClick(sb, code);
      if (click) {
        await sb
          .from("leads")
          .update({ click_id: click.id, code, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      }
    }
  } else {
    const click = code ? await findClick(sb, code) : null;
    const { data: created, error } = await sb
      .from("leads")
      .insert({
        phone,
        name: body.senderName ?? body.chatName ?? null,
        first_message: message,
        code: click ? code : null,
        click_id: click?.id ?? null,
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

async function findClick(sb: SB, code: string): Promise<{ id: string } | null> {
  const { data } = await sb.from("clicks").select("id").eq("code", code).maybeSingle();
  return data ?? null;
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
type ZapiMessage = {
  phone?: string;
  messageId?: string;
  senderName?: string;
  chatName?: string;
  fromMe?: boolean;
  text?: { message?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string };
  buttonsResponseMessage?: { message?: string };
  listResponseMessage?: { message?: string };
};

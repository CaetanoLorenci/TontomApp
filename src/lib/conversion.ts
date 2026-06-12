import { supabaseAdmin } from "@/lib/supabase";
import { sendCapiEvent, eventForStage } from "@/lib/meta-capi";

// Núcleo da conversão: avança o estágio de um lead e devolve o evento pro Meta.
// Usado pelo painel (clique humano) e pelo webhook (gatilho automático).

const STAGE_RANK: Record<string, number> = {
  novo: 0,
  qualificado: 1,
  agendado: 2,
  vendido: 3,
  perdido: -1, // tratado à parte: nunca por ranking
};

export type AdvanceResult =
  | { ok: true; advanced: boolean; capiSent: boolean }
  | { ok: false; error: string };

// onlyForward: true (automação) impede regressão de estágio; false (humano) permite corrigir.
export async function advanceStage(
  leadId: string,
  stage: string,
  value: number | null,
  opts: { onlyForward?: boolean; source: "painel" | "trigger" },
): Promise<AdvanceResult> {
  const sb = supabaseAdmin();

  const { data: lead } = await sb
    .from("leads")
    .select("id, phone, stage, value, clicks(fbc, ctwa_clid)")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: "lead não encontrado" };

  if (opts.onlyForward) {
    const cur = STAGE_RANK[lead.stage] ?? 0;
    const next = STAGE_RANK[stage] ?? 0;
    // automação não rebaixa estágio nem reabre vendido/perdido
    if (stage === "perdido" ? lead.stage === "vendido" : next <= cur) {
      return { ok: true, advanced: false, capiSent: false };
    }
  }

  await sb
    .from("leads")
    .update({
      stage,
      // não apaga valor já registrado se o novo for nulo
      ...(value != null ? { value } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  const eventName = eventForStage(stage);
  if (!eventName || !lead.phone) return { ok: true, advanced: true, capiSent: false };

  // idempotência: 1 evento por lead+estágio (Meta também dedupa pelo event_id)
  const eventId = `${leadId}:${stage}`;
  const { data: already } = await sb
    .from("capi_events")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (already) return { ok: true, advanced: true, capiSent: false };

  const click = lead.clicks as { fbc?: string | null; ctwa_clid?: string | null } | null;
  const fbc = click?.fbc ?? null;
  const ctwaClid = click?.ctwa_clid ?? null;
  try {
    const result = await sendCapiEvent({
      eventName,
      eventId,
      phone: lead.phone,
      fbc,
      ctwaClid,
      value: eventName === "Purchase" ? (value ?? lead.value) : null,
    });
    await sb.from("capi_events").insert({
      lead_id: leadId,
      event_name: eventName,
      event_id: eventId,
      payload: { stage, value: value ?? lead.value, fbc, ctwa_clid: ctwaClid, source: opts.source },
      response: result.body as object,
    });
    return { ok: true, advanced: true, capiSent: result.ok };
  } catch (e) {
    console.error("[conversion] falha no CAPI:", e);
    return { ok: true, advanced: true, capiSent: false };
  }
}

// Extrai valor em R$ de uma mensagem ("fechamos em R$ 1.500,00" -> 1500).
export function extractValue(text: string): number | null {
  const m = text.match(/r\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

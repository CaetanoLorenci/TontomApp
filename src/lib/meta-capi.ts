import { createHash } from "crypto";

// Envia evento de conversão pro Meta (Conversions API).
// É assim que a campanha passa a otimizar por QUALIDADE: só mandamos o evento
// quando o lead vira qualificado/agendado/vendido — não por conversa barata.

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0"; // || (não ??): env vazia também cai no default

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type CapiInput = {
  // nome JÁ no vocabulário do canal certo (ver eventForStage):
  // site = Lead/Schedule/Purchase · mensageria = LeadSubmitted/Purchase
  eventName: string;
  eventId: string; // dedup — mesmo evento não conta 2x
  phone: string; // só dígitos, com DDI
  fbc?: string | null;
  ctwaClid?: string | null; // anúncio nativo de WhatsApp → evento business_messaging
  value?: number | null;
  currency?: string;
  // org com WABA PRÓPRIA (lib/org-creds): token/WABA/dataset dela substituem as envs
  // da Amplia no canal CTWA. Omitido = comportamento atual (infra Amplia).
  creds?: { token?: string | null; wabaId?: string | null; datasetId?: string | null };
};

export type CapiResult = { ok: boolean; status: number; body: unknown };

export async function sendCapiEvent(input: CapiInput): Promise<CapiResult> {
  // CTWA nativo: evento de mensageria (ctwa_clid). Senão: evento de site (fbc do clique).
  const isCtwa = !!input.ctwaClid;
  // canal whatsapp posta no DATASET de mensagens → precisa de token com
  // whatsapp_business_manage_events (o token do pixel NÃO tem acesso ao dataset).
  // site posta no pixel web → token do pixel.
  const token = isCtwa
    ? (input.creds?.token || process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_CAPI_TOKEN)
    : process.env.META_CAPI_TOKEN;
  if (!token) {
    throw new Error("Faltando token CAPI (WHATSAPP_ACCESS_TOKEN/META_CAPI_TOKEN) no ambiente.");
  }
  // CTWA precisa de um DATASET de mensagens ligado à Página. O pixel de site NÃO serve:
  // mandar um evento business_messaging pro pixel web faz o Meta rejeitar/mal-atribuir e
  // ainda polui os dados do pixel. Por isso NÃO usamos fallback: enquanto
  // META_CTWA_DATASET_ID não existir, a gente PULA o envio e loga o motivo (fica visível
  // no capi_events quantas conversões CTWA ficaram sem mandar). Setar a env destrava — sem deploy.
  const datasetId = isCtwa
    ? (input.creds?.datasetId || process.env.META_CTWA_DATASET_ID)
    : process.env.META_PIXEL_ID;
  if (!datasetId) {
    return {
      ok: false,
      status: 0,
      body: {
        skipped: isCtwa
          ? "META_CTWA_DATASET_ID não configurado — evento CTWA NÃO enviado (não cair no pixel web)"
          : "META_PIXEL_ID não configurado — evento de site não enviado",
      },
    };
  }
  const payload = {
    data: [
      {
        event_name: input.eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: isCtwa ? "business_messaging" : "website",
        ...(isCtwa ? { messaging_channel: "whatsapp" } : {}),
        event_id: input.eventId,
        ...(isCtwa ? {} : { event_source_url: process.env.APP_BASE_URL ?? undefined }),
        user_data: {
          ph: [sha256(input.phone.replace(/\D/g, ""))],
          ...(isCtwa ? { ctwa_clid: input.ctwaClid } : {}),
          // canal whatsapp: o Meta casa pelo whatsapp_business_account_id (o dataset é
          // criado a partir da WABA). NÃO mandar page_id: provado em produção (22/jun) que
          // enviar page_id que não é exatamente a página vinculada ao dataset causa
          // subcode 2804065 (página/dataset incompatíveis). Sem page_id → events_received:1.
          ...(isCtwa && (input.creds?.wabaId || process.env.WHATSAPP_WABA_ID)
            ? { whatsapp_business_account_id: input.creds?.wabaId || process.env.WHATSAPP_WABA_ID }
            : {}),
          ...(!isCtwa && input.fbc ? { fbc: input.fbc } : {}),
        },
        ...(input.value != null
          ? { custom_data: { value: input.value, currency: input.currency ?? "BRL" } }
          : {}),
      },
    ],
    ...(process.env.META_TEST_EVENT_CODE
      ? { test_event_code: process.env.META_TEST_EVENT_CODE }
      : {}),
  };

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${datasetId}/events?access_token=${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

// Estágio do funil -> evento que mandamos pro Meta, JÁ no vocabulário do canal.
// Os dois canais têm taxonomias diferentes (confirmado contra a API do Meta):
//  - SITE (link /r, fbc): eventos padrão Lead / Schedule / Purchase
//  - MENSAGERIA (CTWA, ctwa_clid): só LeadSubmitted e Purchase existem — NÃO há Schedule.
// Objetivo do Caetano = call agendada → no CTWA isso é o LeadSubmitted (a conversão
// que a campanha otimiza); a venda fecha depois como Purchase (com valor, p/ ROI).
export function eventForStage(stage: string, isCtwa: boolean): string | null {
  if (isCtwa) {
    switch (stage) {
      case "agendado":
        return "LeadSubmitted"; // ⭐ conversão-objetivo da mensageria
      case "vendido":
        return "Purchase";
      default:
        return null; // qualificado não dispara no CTWA (evita LeadSubmitted duplicado)
    }
  }
  switch (stage) {
    case "qualificado":
      return "Lead";
    case "agendado":
      return "Schedule";
    case "vendido":
      return "Purchase";
    default:
      return null; // 'novo' e 'perdido' não disparam evento
  }
}

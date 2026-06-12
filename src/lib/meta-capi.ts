import { createHash } from "crypto";

// Envia evento de conversão pro Meta (Conversions API).
// É assim que a campanha passa a otimizar por QUALIDADE: só mandamos o evento
// quando o lead vira qualificado/agendado/vendido — não por conversa barata.

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type CapiInput = {
  eventName: "Lead" | "Schedule" | "Purchase";
  eventId: string; // dedup — mesmo evento não conta 2x
  phone: string; // só dígitos, com DDI
  fbc?: string | null;
  ctwaClid?: string | null; // anúncio nativo de WhatsApp → evento business_messaging
  value?: number | null;
  currency?: string;
};

export type CapiResult = { ok: boolean; status: number; body: unknown };

export async function sendCapiEvent(input: CapiInput): Promise<CapiResult> {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token) {
    throw new Error("Faltando META_PIXEL_ID ou META_CAPI_TOKEN no ambiente.");
  }

  // CTWA nativo: evento de mensageria (ctwa_clid). Senão: evento de site (fbc do clique).
  const isCtwa = !!input.ctwaClid;
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
          // business_messaging exige a identidade da Página dona dos anúncios
          ...(isCtwa && process.env.META_PAGE_ID ? { page_id: process.env.META_PAGE_ID } : {}),
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

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

// Estágio do funil -> evento que mandamos pro Meta.
export function eventForStage(
  stage: string,
): CapiInput["eventName"] | null {
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

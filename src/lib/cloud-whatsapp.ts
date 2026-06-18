// Integração com a WhatsApp Cloud API OFICIAL (WABA).
// Substitui/coexiste com o Z-API. Aqui ficam o ENVIO e os TIPOS do webhook.
// A grande vantagem: a 1ª mensagem de um lead de anúncio CTWA traz o objeto
// `referral` com ctwa_clid + source_id nativos → atribuição e conversão oficiais.

const GRAPH = process.env.META_GRAPH_VERSION || "v21.0"; // || (não ??): env vazia também cai no default

export type CloudSendResult = { ok: boolean; status: number; body: unknown };

// Envia mensagem de texto livre (válido dentro da janela de 24h / 72h CTWA).
export async function sendCloudText(toWaId: string, body: string): Promise<CloudSendResult> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) {
    throw new Error("Faltando WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN.");
  }
  const res = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toWaId,
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}

// ───────── tipos do webhook da Cloud API ─────────
export type CloudReferral = {
  source_url?: string;
  source_id?: string; // id do anúncio
  source_type?: string; // "ad"
  headline?: string;
  body?: string;
  ctwa_clid?: string; // identificador nativo de atribuição CTWA
};

export type CloudMessage = {
  from: string; // wa_id (telefone, só dígitos)
  id: string; // wamid...
  timestamp?: string;
  type?: string; // text | image | ...
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  referral?: CloudReferral; // presente na 1ª msg vinda de anúncio CTWA
};

export type CloudContact = { wa_id: string; profile?: { name?: string } };

export type CloudValue = {
  messaging_product?: string;
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: CloudContact[];
  messages?: CloudMessage[];
  // coexistência: mensagens digitadas pelo time no app vêm como echoes
  message_echoes?: CloudMessage[];
  statuses?: unknown[]; // recibos de entrega/leitura — ignorar
};

export type CloudWebhook = {
  object?: string;
  entry?: { id?: string; changes?: { value?: CloudValue; field?: string }[] }[];
};

// Extrai o texto de qualquer tipo de mensagem suportado.
export function cloudText(m: CloudMessage): string | null {
  return (
    m.text?.body ??
    m.image?.caption ??
    m.video?.caption ??
    m.document?.caption ??
    m.button?.text ??
    m.interactive?.button_reply?.title ??
    m.interactive?.list_reply?.title ??
    null
  );
}

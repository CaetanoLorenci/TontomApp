// Monta o link wa.me com a mensagem pré-preenchida contendo o código de atribuição.
// O código vai como "Protocolo: XXXXXX" — natural em atendimento BR, atribuição exata.
// (Zero-width invisível foi testado em campo: o app mobile do WhatsApp strippa.)
// PRECISA ir no text= (não no #fragment, que nunca chega ao servidor/WhatsApp).

// Usa || (não ??) pra que WHATSAPP_DEFAULT_MESSAGE="" (presente porém vazio no .env) também caia no default.
const DEFAULT_TEMPLATE =
  process.env.WHATSAPP_DEFAULT_MESSAGE?.trim() ||
  "Olá! Vim pelo anúncio e quero saber mais.";

// number: só dígitos, com DDI. Ex: 5549999999999
export function buildWaLink(number: string, code: string): string {
  const text = `${DEFAULT_TEMPLATE}\nProtocolo: ${code.replace(/^TT-/, "")}`;
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

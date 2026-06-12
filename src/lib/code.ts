// Código de atribuição que vai DENTRO da mensagem do WhatsApp (no text= do wa.me).
// Formato interno: TT-XXXXXX (6 chars de um alfabeto sem ambíguos: sem 0/O/1/I).
//
// Na mensagem ele vai INVISÍVEL: cada char vira 5 bits codificados em caracteres
// zero-width (U+200B = 0, U+200C = 1), delimitados por U+200D. O lead vê uma
// mensagem limpa; o webhook decodifica e atribui. Fallback: código visível
// "(ref: TT-XXXXXX)" continua sendo reconhecido se algum dia precisarmos dele.

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 chars, sem 0 O 1 I L
const BITS_PER_CHAR = 5;
const PAYLOAD_LEN = 6;

const ZW0 = "​"; // zero-width space  -> bit 0
const ZW1 = "‌"; // zero-width non-joiner -> bit 1
const ZWM = "‍"; // zero-width joiner -> delimitador

export function generateCode(): string {
  const bytes = new Uint8Array(PAYLOAD_LEN);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `TT-${out}`;
}

// Código -> sufixo invisível pra anexar na mensagem do wa.me.
export function encodeInvisible(code: string): string {
  const payload = code.replace(/^TT-/, "");
  let bits = "";
  for (const ch of payload) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) return ""; // código fora do alfabeto: não codifica
    bits += idx.toString(2).padStart(BITS_PER_CHAR, "0");
  }
  let body = "";
  for (const b of bits) body += b === "0" ? ZW0 : ZW1;
  return ZWM + body + ZWM;
}

// Decodifica o código invisível embutido no texto (ou null).
function decodeInvisible(text: string): string | null {
  const re = new RegExp(`${ZWM}([${ZW0}${ZW1}]{${PAYLOAD_LEN * BITS_PER_CHAR}})${ZWM}`, "u");
  const m = text.match(re);
  if (!m) return null;
  let bits = "";
  for (const c of m[1]) bits += c === ZW0 ? "0" : "1";
  let out = "";
  for (let i = 0; i < bits.length; i += BITS_PER_CHAR) {
    const idx = parseInt(bits.slice(i, i + BITS_PER_CHAR), 2);
    if (idx >= ALPHABET.length) return null; // bits corrompidos
    out += ALPHABET[idx];
  }
  return `TT-${out}`;
}

// Extrai o código do texto: primeiro tenta o invisível, depois o visível (fallback).
export function extractCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const invisible = decodeInvisible(text);
  if (invisible) return invisible;
  const m = text.toUpperCase().match(/TT-\s*([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6})/);
  return m ? `TT-${m[1]}` : null;
}

// Remove os caracteres invisíveis (pra exibir/guardar texto limpo quando quiser).
export function stripInvisible(text: string): string {
  return text.replace(/[​‌‍]/g, "");
}

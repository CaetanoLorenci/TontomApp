// Código de atribuição que vai DENTRO da mensagem do WhatsApp (no text= do wa.me).
// Formato: TT-XXXXXX  (6 chars de um alfabeto sem ambíguos: sem 0/O/1/I).
// O webhook do Z-API lê a 1ª mensagem do lead e extrai esse código pra atribuir a origem.

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 chars, sem 0 O 1 I L

export function generateCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `TT-${out}`;
}

// Procura um código TT-XXXXXX no texto (case-insensitive, tolera espaço depois do hífen).
// Retorna normalizado em maiúsculas, ou null.
export function extractCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.toUpperCase().match(/TT-\s*([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6})/);
  return m ? `TT-${m[1]}` : null;
}

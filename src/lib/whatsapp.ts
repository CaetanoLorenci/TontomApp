import { encodeInvisible } from "@/lib/code";

// Monta o link wa.me com a mensagem pré-preenchida — SEM código visível (decisão 11/jun).
// Atribuição: janela de tempo (clique ↔ mensagem-template) + zero-width de bônus
// (mobile strippa, mas desktop/web preserva). PRECISA ir no text= (não no #fragment).

// Usa || (não ??) pra que WHATSAPP_DEFAULT_MESSAGE="" (presente porém vazio no .env) também caia no default.
export const DEFAULT_TEMPLATE =
  process.env.WHATSAPP_DEFAULT_MESSAGE?.trim() ||
  "Olá! Vim pelo anúncio e quero saber mais.";

// number: só dígitos, com DDI. Ex: 5549999999999
export function buildWaLink(number: string, code: string): string {
  const text = `${DEFAULT_TEMPLATE}${encodeInvisible(code)}`;
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

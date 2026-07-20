"use client";

import { useState } from "react";

// Copiar/compartilhar texto pronto (relatório WhatsApp).
// No celular, "Compartilhar" abre a folha nativa → WhatsApp → contato. No PC, copia.
export function CopyShare({ text }: { text: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        /* usuário cancelou a folha — ok */
      }
    } else {
      await copy();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={copy} className="btn btn-ghost btn-sm">
        {done ? "✓ copiado" : "Copiar"}
      </button>
      <button type="button" onClick={share} className="btn btn-primary btn-sm">
        Compartilhar
      </button>
    </div>
  );
}

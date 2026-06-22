"use client";

import { useActionState, useEffect, useRef } from "react";
import { createClientRequest } from "../actions";

// Composer inline da Central (mesma action do botão flutuante).
export function CentralComposer() {
  const [state, action, pending] = useActionState(createClientRequest, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <select
        name="kind"
        defaultValue="geral"
        style={{ colorScheme: "dark" }}
        className="w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none sm:w-56"
      >
        <option value="geral">Geral</option>
        <option value="anuncio">Pedido de anúncio</option>
        <option value="app">Feedback do app</option>
      </select>
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Escreva seu pedido, sugestão ou observação…"
        className="w-full resize-none rounded-xl border border-line bg-transparent px-3 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-ink transition-transform hover:scale-[1.03] disabled:opacity-50"
        >
          {pending ? "Enviando…" : "Enviar"}
        </button>
        {state && (
          <span className={`text-sm ${state.ok ? "text-st-vend" : "text-st-perd"}`}>
            {state.ok ? "✓ " : "✕ "}
            {state.msg}
          </span>
        )}
      </div>
    </form>
  );
}

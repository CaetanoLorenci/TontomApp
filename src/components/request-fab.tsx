"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClientRequest } from "@/app/painel/actions";
import { IconChat } from "./icons";

// Botão flutuante "Pedir / Sugerir" — composer rápido em qualquer tela do painel.
// Manda pra Central do Cliente (createClientRequest) e notifica a Amplia.
export function RequestFab() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createClientRequest, null);
  const formRef = useRef<HTMLFormElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  // Esconde onde já há barra de ações fixa / composer próprio (evita sobreposição):
  // tela do lead (barra "Mover pra" sticky) e a própria Central.
  if (pathname?.startsWith("/painel/lead/") || pathname === "/painel/central") return null;

  return (
    <div className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-50 print:hidden">
      {open && (
        <div className="mb-3 w-[min(90vw,22rem)] rounded-2xl border border-line2 bg-pane p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Pedir / Sugerir</h3>
            <button onClick={() => setOpen(false)} aria-label="fechar" className="text-mist hover:text-snow">
              ✕
            </button>
          </div>
          <p className="mt-0.5 text-xs text-mist">Fale com a Amplia: peça um anúncio, sugira algo ou reporte um problema.</p>

          <form ref={formRef} action={action} className="mt-3 space-y-2">
            <select
              name="kind"
              defaultValue="geral"
              style={{ colorScheme: "dark" }}
              className="w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none"
            >
              <option value="geral">Geral</option>
              <option value="anuncio">Pedido de anúncio</option>
              <option value="app">Feedback do app</option>
            </select>
            <textarea
              name="body"
              required
              rows={3}
              placeholder="Escreva aqui…"
              className="w-full resize-none rounded-xl border border-line bg-transparent px-3 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2">
              <Link href="/painel/central" className="text-xs text-mist underline hover:text-snow">
                ver todos
              </Link>
              <button
                type="submit"
                disabled={pending}
                className="btn btn-primary"
              >
                {pending ? "Enviando…" : "Enviar"}
              </button>
            </div>
            {state && (
              <p className={`text-xs ${state.ok ? "text-st-vend" : "text-st-perd"}`}>
                {state.ok ? "✓ " : "✕ "}
                {state.msg}
              </p>
            )}
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full bg-signal px-4 py-3 font-semibold text-ink shadow-2xl transition-transform hover:scale-[1.05]"
        aria-label="Pedir ou sugerir"
      >
        <IconChat size={18} />
        <span className="hidden sm:inline">Pedir / Sugerir</span>
      </button>
    </div>
  );
}

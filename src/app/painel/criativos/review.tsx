"use client";

import { useState } from "react";
import { aprovarCriativo, reprovarCriativo } from "./actions";

/* Botões de aprovação do criativo. Reprovar exige motivo com >= 25 palavras
   (trava no botão + reforço no servidor e no banco). */
export function ReviewCreative({ id }: { id: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [words, setWords] = useState(0);

  return (
    <div className="mt-3">
      {!rejecting ? (
        <div className="flex items-center gap-1.5">
          <form action={aprovarCriativo}>
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              className="rounded-lg border border-st-vend/40 bg-pane2 px-3 py-1.5 text-xs font-semibold text-st-vend transition-transform hover:scale-[1.03]"
            >
              Aprovar
            </button>
          </form>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="rounded-lg border border-line2 px-3 py-1.5 text-xs font-medium text-mist transition-colors hover:border-st-perd/50 hover:text-st-perd"
          >
            Reprovar
          </button>
        </div>
      ) : (
        <form action={reprovarCriativo} className="space-y-2">
          <input type="hidden" name="id" value={id} />
          <textarea
            name="motivo"
            required
            placeholder="Explique o que precisa mudar (mínimo 25 palavras)…"
            onChange={(e) => setWords(e.target.value.trim().split(/\s+/).filter(Boolean).length)}
            className="min-h-24 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className={`num text-[11px] ${words < 25 ? "text-faint" : "text-st-vend"}`}>
              {words} / 25 palavras
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRejecting(false)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-mist hover:text-snow"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={words < 25}
                className="rounded-lg bg-st-perd px-3 py-1.5 text-xs font-semibold text-ink transition-transform hover:scale-[1.03] disabled:opacity-40 disabled:hover:scale-100"
              >
                Confirmar reprovação
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

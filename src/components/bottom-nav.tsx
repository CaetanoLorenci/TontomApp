"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

// Barra de navegação inferior (só mobile) — padrão de app: 4 destinos principais
// no alcance do polegar + "Mais" abre folha com o resto. No desktop fica oculta
// (o header em abas continua lá). A classe `bottom-nav` é usada pelo globals.css
// pra reservar o espaço no rodapé do body (body:has(.bottom-nav)).

export type NavItem = { key: string; href: string; label: string; icon: ReactNode };

const PRIMARY_KEYS = ["painel", "pipeline", "agenda", "anuncios"];

function MoreIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="19" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function BottomNav({ items, active }: { items: NavItem[]; active: string }) {
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = PRIMARY_KEYS.map((k) => items.find((i) => i.key === k)).filter(
    (i): i is NavItem => !!i,
  );
  const rest = items.filter((i) => !PRIMARY_KEYS.includes(i.key));
  const activeInRest = rest.some((i) => i.key === active);

  const itemCls = (on: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold ${
      on ? "text-signal" : "text-mist"
    }`;

  return (
    <>
      {/* folha "Mais" */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-ink/60 backdrop-blur-[2px]" />
          <div
            className="absolute inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] rounded-2xl border border-line2 bg-pane p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {rest.map((it) => (
              <Link
                key={it.key}
                href={it.href}
                onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
                  it.key === active ? "bg-signal-soft text-signal" : "text-snow active:bg-pane2"
                }`}
              >
                <span className="text-mist">{it.icon ?? <span className="inline-block w-3.5" />}</span>
                {it.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* barra fixa */}
      <nav
        className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
        aria-label="Navegação principal"
      >
        <div className="flex items-stretch">
          {primary.map((it) => (
            <Link key={it.key} href={it.href} className={itemCls(it.key === active)}>
              {it.icon}
              <span className="truncate">{it.label}</span>
            </Link>
          ))}
          <button type="button" onClick={() => setMoreOpen((v) => !v)} className={itemCls(activeInRest || moreOpen)}>
            <MoreIcon size={20} />
            <span>Mais</span>
          </button>
        </div>
      </nav>
    </>
  );
}

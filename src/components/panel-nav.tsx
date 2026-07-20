import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { LogoMark, IconChat, IconFunnel, IconCalendar, IconBroadcast, IconTarget, IconTrend, IconImage, IconFolder } from "./icons";
import { PushToggle } from "./push-toggle";
import { RequestFab } from "./request-fab";
import { BottomNav, type NavItem } from "./bottom-nav";

// Header compartilhado do painel — mobile-first:
//  · celular: header enxuto (logo + ações da tela + sino) e navegação na BARRA INFERIOR
//    fixa (BottomNav — 4 destinos no polegar + "Mais"), padrão de app.
//  · desktop (sm+): header com a linha de abas de sempre; barra inferior some.
type Key = "painel" | "pipeline" | "agenda" | "anuncios" | "relatorios" | "criativos" | "projetos" | "central" | "clientes" | "acesso" | "contas";

type Item = { key: Key; href: string; label: string; Icon: ComponentType<{ size?: number; className?: string }> | null };

const BASE: Item[] = [
  { key: "painel", href: "/painel", label: "Painel", Icon: IconChat },
  { key: "pipeline", href: "/painel/pipeline", label: "Pipeline", Icon: IconFunnel },
  { key: "agenda", href: "/painel/agenda", label: "Agenda", Icon: IconCalendar },
  { key: "anuncios", href: "/painel/anuncios", label: "Anúncios", Icon: IconBroadcast },
  { key: "relatorios", href: "/painel/relatorios", label: "Relatórios", Icon: IconTrend },
  { key: "criativos", href: "/painel/criativos", label: "Criativos", Icon: IconImage },
  { key: "projetos", href: "/painel/projetos", label: "Projetos", Icon: IconFolder },
  { key: "central", href: "/painel/central", label: "Central", Icon: null },
];

const ADMIN: Item[] = [
  { key: "contas", href: "/painel/contas", label: "Contas", Icon: IconTarget },
  { key: "clientes", href: "/painel/clientes", label: "Clientes", Icon: null },
  { key: "acesso", href: "/painel/acesso", label: "Acesso", Icon: null },
];

export function PanelNav({
  active,
  seesAll = false,
  right,
}: {
  active: Key;
  seesAll?: boolean;
  right?: ReactNode;
}) {
  const items = seesAll ? [...BASE, ...ADMIN] : BASE;
  const bottomItems: NavItem[] = items.map((it) => ({
    key: it.key,
    href: it.href,
    label: it.label,
    icon: it.Icon ? <it.Icon size={20} /> : null,
  }));

  return (
    <>
    {/* .panel-header (globals.css): no celular vira estático (rola com a página — a
        navegação mora na barra inferior) e, no app instalado, desce abaixo da status
        bar do iPhone com fallback fixo (não depende do env() do aparelho). */}
    <header className="panel-header sticky top-0 z-20 border-b border-line bg-ink/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2.5 sm:px-6 sm:py-3">
        {/* linha única no mobile: logo + ações da tela + sino */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/painel" className="flex shrink-0 items-center gap-2.5">
            <LogoMark size={26} />
            <span className="font-head text-lg font-extrabold tracking-tight">
              Amplia <span className="text-signal">Hub</span>
            </span>
          </Link>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {right}
            <PushToggle />
          </div>
        </div>

        {/* abas: só desktop — no celular a navegação vive na barra inferior */}
        <nav className="hidden flex-wrap rounded-xl border border-line bg-pane p-1 text-sm sm:flex">
          {items.map((it) =>
            it.key === active ? (
              <span
                key={it.key}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-signal-soft px-3 py-1.5 font-semibold text-signal"
              >
                {it.Icon && <it.Icon size={14} />} {it.label}
              </span>
            ) : (
              <Link
                key={it.key}
                href={it.href}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-mist transition-colors hover:text-snow"
              >
                {it.Icon && <it.Icon size={14} />} {it.label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </header>
    <BottomNav items={bottomItems} active={active} />
    <RequestFab />
    </>
  );
}

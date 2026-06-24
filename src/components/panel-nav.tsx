import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark, IconChat, IconFunnel, IconCalendar, IconBroadcast, IconTarget, IconTrend, IconImage, IconFolder } from "./icons";
import { PushToggle } from "./push-toggle";
import { RequestFab } from "./request-fab";

// Header compartilhado do painel — responsivo: no celular empilha (logo em cima,
// abas rolando na horizontal) e no desktop fica em linha. Evita o corte das abas no mobile.
type Key = "painel" | "pipeline" | "agenda" | "anuncios" | "relatorios" | "criativos" | "projetos" | "central" | "clientes" | "acesso";

const BASE = [
  { key: "painel", href: "/painel", label: "Painel", icon: <IconChat size={14} /> },
  { key: "pipeline", href: "/painel/pipeline", label: "Pipeline", icon: <IconFunnel size={14} /> },
  { key: "agenda", href: "/painel/agenda", label: "Agenda", icon: <IconCalendar size={14} /> },
  { key: "anuncios", href: "/painel/anuncios", label: "Anúncios", icon: <IconBroadcast size={14} /> },
  { key: "relatorios", href: "/painel/relatorios", label: "Relatórios", icon: <IconTrend size={14} /> },
  { key: "criativos", href: "/painel/criativos", label: "Criativos", icon: <IconImage size={14} /> },
  { key: "projetos", href: "/painel/projetos", label: "Projetos", icon: <IconFolder size={14} /> },
  { key: "central", href: "/painel/central", label: "Central", icon: null },
] as const;

const ADMIN = [
  { key: "clientes", href: "/painel/clientes", label: "Clientes", icon: <IconTarget size={14} /> },
  { key: "acesso", href: "/painel/acesso", label: "Acesso", icon: null },
] as const;

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
  return (
    <>
    <header className="sticky top-0 z-20 border-b border-line bg-ink/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:px-6">
        <Link href="/painel" className="flex shrink-0 items-center gap-2.5">
          <LogoMark size={26} />
          <span className="font-head text-lg font-extrabold tracking-tight">
            Amplia <span className="text-signal">Hub</span>
          </span>
        </Link>

        {/* menu em linha própria, abaixo do logo; abas quebram linha quando não cabem */}
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex flex-wrap rounded-xl border border-line bg-pane p-1 text-sm">
            {items.map((it) =>
              it.key === active ? (
                <span
                  key={it.key}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-signal-soft px-3 py-1.5 font-semibold text-signal"
                >
                  {it.icon} {it.label}
                </span>
              ) : (
                <Link
                  key={it.key}
                  href={it.href}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-mist transition-colors hover:text-snow"
                >
                  {it.icon} {it.label}
                </Link>
              ),
            )}
          </nav>
          {right}
          <PushToggle />
        </div>
      </div>
    </header>
    <RequestFab />
    </>
  );
}

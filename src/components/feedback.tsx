import type { ReactNode } from "react";
import { LogoMark } from "./icons";

// Tela de carregamento com a marca (sonar pulsando). Usada nos loading.tsx das rotas.
export function LoadingScreen({ label = "Carregando…" }: { label?: string }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center">
      <div className="atmosphere" />
      <div className="relative z-10 flex flex-col items-center">
        <div className="relative flex h-20 w-20 items-center justify-center">
          <span className="sonar-ring absolute inset-0 rounded-full border-2 border-signal/50" />
          <span className="sonar-ring-2 absolute inset-2 rounded-full border border-signal/35" />
          <LogoMark size={44} />
        </div>
        <p className="num mt-5 text-xs uppercase tracking-[0.3em] text-faint">{label}</p>
      </div>
    </main>
  );
}

// Estado vazio padronizado (com a marca). title + dica opcional + ações opcionais.
export function EmptyState({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card border-dashed p-10 text-center ${className}`}>
      <LogoMark size={34} className="mx-auto opacity-50" />
      <p className="mt-3 font-medium text-mist">{title}</p>
      {hint && <p className="mt-1 text-sm text-faint">{hint}</p>}
      {children}
    </div>
  );
}

import Link from "next/link";
import { LogoMark, IconAdvance } from "@/components/icons";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div className="atmosphere" />

      <div className="relative z-10 flex flex-col items-center text-center">
        {/* sonar */}
        <div className="relative flex h-28 w-28 items-center justify-center">
          <span className="sonar-ring absolute inset-0 rounded-full border-2 border-signal/50" />
          <span className="sonar-ring-2 absolute inset-3 rounded-full border border-signal/35" />
          <LogoMark size={64} className="anim-up" />
        </div>

        <h1 className="anim-up mt-6 text-5xl font-bold tracking-tighter" style={{ animationDelay: "120ms" }}>
          tontom<span className="text-signal">.</span>
        </h1>

        <p className="anim-up mt-4 max-w-md text-balance text-lg text-mist" style={{ animationDelay: "240ms" }}>
          Sonar de conversas: rastreia cada lead do WhatsApp até o anúncio que o trouxe — e devolve a venda pro Meta
          otimizar por <span className="font-semibold text-snow">qualidade</span>.
        </p>

        <div
          className="num anim-up mt-6 flex items-center gap-3 text-xs uppercase tracking-widest text-faint"
          style={{ animationDelay: "360ms" }}
        >
          <span>anúncio</span>
          <IconAdvance size={12} />
          <span>conversa</span>
          <IconAdvance size={12} />
          <span>venda</span>
          <IconAdvance size={12} />
          <span className="text-signal">meta capi</span>
        </div>

        <Link
          href="/painel"
          className="anim-up mt-10 flex items-center gap-2 rounded-2xl bg-signal px-7 py-3.5 font-semibold text-ink transition-transform hover:scale-[1.04]"
          style={{ animationDelay: "480ms" }}
        >
          Abrir painel
          <IconAdvance size={16} />
        </Link>
      </div>

      <footer className="absolute bottom-6 z-10 text-xs text-faint">Grupo Amplia · uso interno (MVP)</footer>
    </main>
  );
}

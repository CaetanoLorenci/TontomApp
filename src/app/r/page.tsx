import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { generateCode } from "@/lib/code";
import { buildWaLink } from "@/lib/whatsapp";
import { LogoMark, IconChat, IconAdvance } from "@/components/icons";

export const dynamic = "force-dynamic";

// Página-PONTE (não é redirect). O anúncio aponta pra cá; a Meta vê um site real
// (não um pulo pro wa.me, que ela bloqueia). Capturamos a origem no carregamento e
// o lead clica no botão pra ir ao WhatsApp — método "Anúncio → Site → WhatsApp" (Tintim).
const BOT = /facebookexternalhit|facebot|bingbot|googlebot|adsbot|crawler|spider|slurp|preview|whatsapp/i;

function str(v: string | string[] | undefined): string | null {
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? null) : null;
}

export default async function Bridge({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const number = process.env.WHATSAPP_NUMBER;
  const code = generateCode();
  const fbclid = str(sp.fbclid);
  // fbc é montado na hora do CAPI a partir do fbclid + created_at do clique
  // (evita Date.now() no render, proibido pela regra de pureza do React).

  const h = await headers();
  const ua = h.get("user-agent") ?? "";

  // Só grava o clique pra visitante real (evita inflar com o robô da Meta/buscadores).
  if (number && !BOT.test(ua)) {
    try {
      await supabaseAdmin()
        .from("clicks")
        .insert({
          code,
          fbclid,
          utm_source: str(sp.utm_source),
          utm_medium: str(sp.utm_medium),
          utm_campaign: str(sp.utm_campaign),
          utm_content: str(sp.utm_content),
          utm_term: str(sp.utm_term),
          ad_id: str(sp.ad_id),
          adset_id: str(sp.adset_id),
          campaign_id: str(sp.campaign_id),
          referrer: h.get("referer"),
          user_agent: ua,
          ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        });
    } catch (e) {
      console.error("[/r] falha ao salvar click:", e);
    }
  }

  const waLink = number ? buildWaLink(number, code) : "#";

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="atmosphere" />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        <div className="anim-up flex items-center gap-2.5">
          <LogoMark size={30} />
          <span className="text-xl font-bold tracking-tight">
            Amplia<span className="text-signal">.</span>
          </span>
        </div>

        <h1
          className="anim-up mt-8 text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
          style={{ animationDelay: "100ms" }}
        >
          Marketing que enche a agenda com{" "}
          <span className="text-signal">cliente certo</span> — não com curtida.
        </h1>

        <p
          className="anim-up mt-4 text-base leading-relaxed text-mist"
          style={{ animationDelay: "200ms" }}
        >
          Você está a um clique de falar com a gente. Vamos entender sua operação e te
          mostrar onde está travando a entrada de cliente novo.
        </p>

        <a
          href={waLink}
          className="anim-up mt-8 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-signal px-7 py-4 text-lg font-semibold text-ink transition-transform hover:scale-[1.03]"
          style={{ animationDelay: "320ms" }}
        >
          <IconChat size={20} />
          Falar no WhatsApp
          <IconAdvance size={18} />
        </a>

        <p
          className="anim-up mt-4 text-xs text-faint"
          style={{ animationDelay: "420ms" }}
        >
          Resposta rápida, no horário comercial. Sem compromisso.
        </p>
      </div>

      <footer className="absolute bottom-6 z-10 text-xs text-faint">
        Grupo Amplia · Marketing de Alta Performance
      </footer>
    </main>
  );
}

import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateCode } from "@/lib/code";
import { buildWaLink } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // sempre roda em request-time (lê searchParams + grava no banco)

// Entrada do funil. O anúncio aponta pra cá:
//   https://<app>/r?utm_source=...&utm_campaign=...&fbclid={{...}}
// Captura origem -> gera código -> salva click -> redireciona pro WhatsApp com o código no texto.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const number = process.env.WHATSAPP_NUMBER;

  if (!number) {
    return new NextResponse("WHATSAPP_NUMBER não configurado.", { status: 500 });
  }

  const code = generateCode();
  const fbclid = sp.get("fbclid");
  // fbc no formato que o CAPI espera: fb.1.<timestamp_ms>.<fbclid>
  const fbc = fbclid ? `fb.1.${Date.now()}.${fbclid}` : null;

  const click = {
    code,
    fbclid,
    fbc,
    utm_source: sp.get("utm_source"),
    utm_medium: sp.get("utm_medium"),
    utm_campaign: sp.get("utm_campaign"),
    utm_content: sp.get("utm_content"),
    utm_term: sp.get("utm_term"),
    ad_id: sp.get("ad_id"),
    adset_id: sp.get("adset_id"),
    campaign_id: sp.get("campaign_id"),
    referrer: req.headers.get("referer"),
    user_agent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  };

  try {
    const { error } = await supabaseAdmin().from("clicks").insert(click);
    if (error) {
      // Não trava o lead: loga e segue pro WhatsApp mesmo sem ter salvo a atribuição.
      console.error("[/r] falha ao salvar click:", error.message);
    }
  } catch (e) {
    console.error("[/r] erro inesperado:", e);
  }

  return NextResponse.redirect(buildWaLink(number, code), { status: 302 });
}

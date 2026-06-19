import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Protege o painel. /r e /api/webhook ficam abertos (portas do funil).
// TRANSIÇÃO: aceita sessão Supabase (link mágico) OU Basic Auth (antigo) — sem lockout.
// Quando o login mágico estiver validado, remover o trecho do Basic Auth.
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  // 1) Sessão Supabase (Auth) — renova cookies de sessão de quebra.
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(list) {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (user) return res;

  // 2) Basic Auth (fallback de transição — curl/legado).
  const passUser = process.env.PAINEL_USER || "amplia";
  const pass = process.env.PAINEL_PASSWORD;
  if (pass) {
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Basic ")) {
      try {
        const [u, p] = atob(auth.slice(6)).split(":");
        if (u === passUser && p === pass) return res;
      } catch {
        /* header malformado */
      }
    }
  }

  // 3) Sem sessão → vai pro login mágico.
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/painel/:path*", "/painel"],
};

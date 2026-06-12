import { NextResponse, type NextRequest } from "next/server";

// Protege o painel com Basic Auth (uma senha só, do time).
// /r e /api/webhook ficam abertos de propósito: são as portas do funil.
export function proxy(req: NextRequest) {
  const user = process.env.PAINEL_USER || "amplia";
  const pass = process.env.PAINEL_PASSWORD;
  if (!pass) return NextResponse.next(); // sem senha configurada, não tranca (dev)

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const [u, p] = atob(auth.slice(6)).split(":");
      if (u === user && p === pass) return NextResponse.next();
    } catch {
      /* header malformado → cai no 401 */
    }
  }

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Tontom", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/painel/:path*", "/painel"],
};

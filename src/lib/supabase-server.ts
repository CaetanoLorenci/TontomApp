import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente Supabase server-side ligado aos cookies da sessão (Auth).
// Usado em server components / route handlers pra saber QUEM está logado.
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // chamado de um server component (sem set de cookie) — ok, o proxy renova.
          }
        },
      },
    },
  );
}

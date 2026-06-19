import { createBrowserClient } from "@supabase/ssr";

// Cliente Supabase pro browser (anon key) — usado no login (signInWithOtp).
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

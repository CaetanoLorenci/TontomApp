// Diagnóstico: envia push direto pras inscrições salvas, usando as chaves do .env.local.
// Rodar: node --env-file=.env.local scripts/test-push.mjs
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:contato@grupoampliamkt.com";
console.log("VAPID pub len:", pub?.length, "priv len:", priv?.length, "subject:", subject);
webpush.setVapidDetails(subject, pub, priv);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth");
if (error) {
  console.error("DB error:", error.message);
  process.exit(1);
}
console.log("inscrições:", data?.length ?? 0);

for (const s of data ?? []) {
  try {
    const res = await webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify({ title: "Amplia Hub", body: "Teste direto ✅ — chegou?", url: "/painel", tag: "diag" }),
    );
    console.log("OK", res.statusCode, "→", s.id);
  } catch (e) {
    console.log("ERR statusCode:", e.statusCode, "| body:", e.body, "| headers:", JSON.stringify(e.headers ?? {}), "→", s.id);
  }
}

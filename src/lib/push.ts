import webpush from "web-push";
import { supabaseAdmin } from "./supabase";

// Envio de Web Push (notificações). Usa as chaves VAPID do ambiente.
// As inscrições ficam em push_subscriptions (por org). Inscrição expirada (404/410)
// é removida automaticamente.

let configured = false;
function ensureVapid(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:contato@grupoampliamkt.com";
  if (!pub || !priv) {
    console.error("[push] Faltando NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.");
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

// Envia o push pros inscritos das orgs informadas (dedup). Amplia normalmente
// entra junto pra ver tudo. Retorna quantos foram entregues.
export async function sendPushToOrgs(orgs: string[], payload: PushPayload): Promise<number> {
  if (!ensureVapid()) return 0;
  const uniq = [...new Set(orgs.filter(Boolean))];
  if (!uniq.length) return 0;

  const sb = supabaseAdmin();
  const { data: subs } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("org_id", uniq);
  if (!subs?.length) return 0;

  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await sb.from("push_subscriptions").delete().eq("id", s.id); // inscrição morta
        } else {
          console.error("[push] envio falhou:", code, (err as { body?: unknown })?.body);
        }
      }
    }),
  );
  return sent;
}

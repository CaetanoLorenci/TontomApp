"use client";

import { useEffect, useState } from "react";
import { savePushSubscription, removePushSubscription, sendTestPush } from "@/app/painel/actions";
import { IconBell } from "./icons";

// Botão de notificações: ativa/desativa o push neste dispositivo.
// Some onde não há suporte (ex.: iOS Safari fora do app instalado).
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  function flash(m: string) {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 4000);
  }

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        flash("Permissão negada. Ative as notificações nas configurações do navegador/app.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        flash("Notificações não configuradas no servidor.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      await savePushSubscription(JSON.parse(JSON.stringify(sub)), navigator.userAgent);
      setSubscribed(true);
      await sendTestPush(); // já mostra que funcionou
    } catch (e) {
      console.warn("[push] enable falhou:", e);
      flash("Não foi possível ativar aqui. No iPhone, abra pelo app instalado.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      console.warn("[push] disable falhou:", e);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={subscribed ? disable : enable}
        disabled={busy}
        title={subscribed ? "Notificações ativas — toque para desativar" : "Ativar notificações"}
        aria-label={subscribed ? "Desativar notificações" : "Ativar notificações"}
        className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors disabled:opacity-50 ${
          subscribed
            ? "border-signal/50 bg-signal-soft text-signal"
            : "border-line bg-pane text-mist hover:border-line2 hover:text-snow"
        }`}
      >
        <IconBell size={16} filled={subscribed} />
      </button>
      {msg && (
        <span className="absolute right-0 top-11 z-50 w-56 rounded-lg border border-line2 bg-pane px-3 py-2 text-xs text-mist shadow-xl">
          {msg}
        </span>
      )}
    </div>
  );
}

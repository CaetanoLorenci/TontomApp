"use client";

import { useEffect } from "react";

// Registra o service worker (PWA). Roda só no cliente, em browsers compatíveis.
// updateViaCache:"none" garante que o SW novo seja buscado da rede a cada visita.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((e) => console.warn("SW register falhou:", e));
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}

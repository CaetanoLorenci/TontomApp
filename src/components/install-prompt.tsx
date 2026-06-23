"use client";

import { useEffect, useState } from "react";

// Banner discreto de instalação do PWA.
// Android/desktop: usa o evento beforeinstallprompt (botão "Instalar").
// iOS Safari: não tem o evento → mostra a instrução manual (Compartilhar → Adicionar à Tela de Início).
// Some quando já instalado (standalone) ou quando o usuário dispensa.

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "ah_install_dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return; // já instalado

    if (localStorage.getItem(DISMISS_KEY) === "1") return; // já dispensado

    const ios = /ipad|iphone|ipod/i.test(navigator.userAgent);
    const isSafari = ios && /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    const onInstalled = () => setShow(false);
    window.addEventListener("appinstalled", onInstalled);

    // iOS não dispara beforeinstallprompt → mostramos a dica direto.
    if (isSafari) {
      setIsIOS(true);
      setShow(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sem localStorage */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => {});
    setDeferred(null);
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-line2 bg-pane px-4 py-3 shadow-2xl backdrop-blur-md">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-signal-soft">
          <img src="/icon-192.png" alt="" className="h-6 w-6 rounded-md" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-snow">Instalar Amplia Hub</p>
          <p className="truncate text-xs text-mist">
            {isIOS ? "Toque em Compartilhar → Adicionar à Tela de Início" : "Acesso rápido pela tela inicial do celular"}
          </p>
        </div>
        {!isIOS && (
          <button
            onClick={install}
            className="btn btn-primary btn-sm shrink-0"
          >
            Instalar
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="Dispensar"
          className="shrink-0 rounded-lg px-2 py-1 text-mist transition-colors hover:text-snow"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

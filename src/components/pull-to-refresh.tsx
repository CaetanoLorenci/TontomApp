"use client";

import { useEffect, useRef, useState } from "react";

// Puxar-pra-atualizar (pull-to-refresh) — só no app instalado (standalone),
// onde o iOS NÃO tem o gesto nativo. Puxa pra baixo no topo → spinner → recarrega.
const TRIGGER = 70; // px de arraste (após resistência) pra disparar
const MAX = 90;

export function PullToRefresh() {
  const [dist, setDist] = useState(0);
  const [spin, setSpin] = useState(false);
  const startY = useRef<number | null>(null);
  const distRef = useRef(0);
  const spinRef = useRef(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return; // navegador normal já tem o gesto nativo

    const setD = (v: number) => {
      distRef.current = v;
      setDist(v);
    };
    const setS = (v: boolean) => {
      spinRef.current = v;
      setSpin(v);
    };

    function onStart(e: TouchEvent) {
      startY.current = window.scrollY <= 0 && !spinRef.current ? e.touches[0].clientY : null;
    }
    function onMove(e: TouchEvent) {
      if (startY.current == null || spinRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && window.scrollY <= 0) {
        const d = Math.min(MAX, dy * 0.5); // resistência elástica
        if (d > 4 && e.cancelable) e.preventDefault();
        setD(d);
      } else if (distRef.current !== 0) {
        setD(0);
      }
    }
    function onEnd() {
      if (startY.current == null) return;
      startY.current = null;
      if (distRef.current >= TRIGGER) {
        setS(true);
        setD(MAX);
        window.location.reload(); // reset/atualização de verdade (HTML fresco via SW)
      } else {
        setD(0);
      }
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  if (dist === 0 && !spin) return null;

  const progress = Math.min(1, dist / TRIGGER);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center"
      style={{
        transform: `translateY(${spin ? 14 : dist - 10}px)`,
        transition: spin ? "transform .2s ease" : "none",
      }}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line2 bg-pane shadow-lg">
        <span
          className={`h-4 w-4 rounded-full border-2 border-faint border-t-signal ${spin ? "animate-spin" : ""}`}
          style={spin ? undefined : { transform: `rotate(${progress * 270}deg)`, opacity: 0.4 + progress * 0.6 }}
        />
      </div>
    </div>
  );
}

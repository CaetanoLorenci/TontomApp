"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import Link from "next/link";
import { moveLeadStage } from "../actions";
import { STAGE_META, brl, formatSchedule } from "@/lib/format";
import { IconCalendar, IconChat } from "@/components/icons";

// Kanban do funil: colunas por estágio, arrastar lead entre elas (move + dispara CAPI).
// Drag com Pointer Events (funciona no TOQUE e no mouse) — card "flutua" sob o dedo,
// colunas rolam na horizontal (swipe no fundo) e auto-scroll perto das bordas.
const ORDER = ["novo", "qualificado", "agendado", "vendido", "perdido"];

export type PipelineCard = {
  id: string;
  name: string | null;
  stage: string;
  value: number | null;
  scheduled_at: string | null;
  campaign: string | null;
  image: string | null;
};

function parseBRL(s: string): number | null {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

type DragRef = { id: string; from: string; offX: number; offY: number; w: number; name: string };
type Ghost = { left: number; top: number; w: number; name: string };
// toque pendente: vira arrasto se SEGURAR (long-press); vira rolagem se mover rápido.
type PendingRef = {
  card: PipelineCard;
  el: HTMLElement;
  startX: number;
  startY: number;
  isTouch: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

const HOLD_MS = 280; // toque: segurar pra ativar o arrasto (padrão Trello/Todoist)
const SCROLL_TOLERANCE = 10; // toque: mover mais que isso antes do hold = rolagem
const MOUSE_THRESHOLD = 4; // mouse: arrasta após 4px (clique limpo continua clique)

export function Board({ initial }: { initial: PipelineCard[] }) {
  const [cards, setCards] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [pendingSale, setPendingSale] = useState<string | null>(null);
  const [saleValue, setSaleValue] = useState("");
  const [, startTransition] = useTransition();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragRef | null>(null);
  const pending = useRef<PendingRef | null>(null);
  const autoScroll = useRef<{ dx: number; dy: number; raf: number } | null>(null);
  // durante o arrasto no toque, bloqueia a rolagem nativa (senão o iOS cancela o gesto)
  const scrollBlocker = useRef<((e: TouchEvent) => void) | null>(null);

  function startBlockScroll() {
    if (scrollBlocker.current) return;
    const h = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", h, { passive: false });
    scrollBlocker.current = h;
  }
  function stopBlockScroll() {
    if (scrollBlocker.current) {
      document.removeEventListener("touchmove", scrollBlocker.current);
      scrollBlocker.current = null;
    }
  }
  function cancelPending() {
    if (pending.current?.timer) clearTimeout(pending.current.timer);
    pending.current = null;
  }

  // Descobre o estágio sob um ponto da tela (hit-test robusto, considera o scroll).
  function stageAt(x: number, y: number): string | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const col = (el as HTMLElement).closest?.("[data-stage]");
      if (col) return col.getAttribute("data-stage");
    }
    return null;
  }

  // auto-scroll durante o arraste: horizontal no container (desktop) e vertical
  // na janela (mobile, colunas empilhadas) — assim dá pra arrastar pra coluna distante.
  function runAutoScroll() {
    const st = autoScroll.current;
    if (!st) return;
    if (st.dx) scrollerRef.current?.scrollBy({ left: st.dx });
    if (st.dy) window.scrollBy(0, st.dy);
    st.raf = requestAnimationFrame(runAutoScroll);
  }
  function setAutoScroll(dx: number, dy: number) {
    if (autoScroll.current && autoScroll.current.dx === dx && autoScroll.current.dy === dy) return;
    stopAutoScroll();
    if (dx === 0 && dy === 0) return;
    autoScroll.current = { dx, dy, raf: requestAnimationFrame(runAutoScroll) };
  }
  function stopAutoScroll() {
    if (autoScroll.current) {
      cancelAnimationFrame(autoScroll.current.raf);
      autoScroll.current = null;
    }
  }

  // Ativa o arrasto de verdade (depois do hold no toque / do threshold no mouse).
  function activateDrag(x: number, y: number) {
    const p = pending.current;
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    const r = p.el.getBoundingClientRect();
    drag.current = {
      id: p.card.id,
      from: p.card.stage,
      offX: Math.min(Math.max(x - r.left, 0), r.width),
      offY: Math.min(Math.max(y - r.top, 0), r.height),
      w: r.width,
      name: p.card.name ?? "Sem nome",
    };
    if (p.isTouch) {
      startBlockScroll();
      navigator.vibrate?.(15); // feedback tátil onde houver suporte (Android)
    }
    pending.current = null;
    setDragId(drag.current.id);
    setOver(drag.current.from);
    setGhost({ left: r.left, top: r.top, w: r.width, name: drag.current.name });
  }

  function onPointerDown(e: React.PointerEvent, card: PipelineCard) {
    if (pendingSale || drag.current) return;
    // deixa links/botões/inputs do card funcionarem (abrir lead, confirmar venda)
    if ((e.target as HTMLElement).closest("a,button,input")) return;
    const el = e.currentTarget as HTMLElement;
    const isTouch = e.pointerType !== "mouse";
    cancelPending();
    const p: PendingRef = { card, el, startX: e.clientX, startY: e.clientY, isTouch, timer: null };
    pending.current = p;
    el.setPointerCapture(e.pointerId);
    // toque: só vira arrasto se SEGURAR — rolar a página nunca move card de coluna.
    if (isTouch) {
      const x = e.clientX;
      const y = e.clientY;
      p.timer = setTimeout(() => {
        if (pending.current === p) activateDrag(x, y);
      }, HOLD_MS);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    // fase pendente: decide entre rolagem (toque rápido) e arrasto (mouse passou do threshold)
    const p = pending.current;
    if (p && !drag.current) {
      const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
      if (p.isTouch) {
        if (dist > SCROLL_TOLERANCE) cancelPending(); // é rolagem — deixa o navegador rolar
      } else if (dist > MOUSE_THRESHOLD) {
        activateDrag(e.clientX, e.clientY);
      }
    }
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    setGhost({ left: e.clientX - d.offX, top: e.clientY - d.offY, w: d.w, name: d.name });
    const s = stageAt(e.clientX, e.clientY);
    if (s) setOver(s);
    const EDGE = 56;
    let dx = 0;
    let dy = 0;
    const sc = scrollerRef.current;
    if (sc) {
      const rect = sc.getBoundingClientRect();
      // só rola horizontal se o container de fato rola na horizontal (desktop)
      if (sc.scrollWidth > sc.clientWidth + 4) {
        if (e.clientX < rect.left + EDGE) dx = -16;
        else if (e.clientX > rect.right - EDGE) dx = 16;
      }
    }
    const vh = window.innerHeight;
    if (e.clientY < EDGE) dy = -16;
    else if (e.clientY > vh - EDGE) dy = 16;
    setAutoScroll(dx, dy);
  }

  function onPointerUp(e: React.PointerEvent) {
    cancelPending(); // toque curto sem hold = tap, nunca move
    const d = drag.current;
    drag.current = null;
    stopAutoScroll();
    stopBlockScroll();
    setDragId(null);
    setGhost(null);
    const target = stageAt(e.clientX, e.clientY) ?? over;
    setOver(null);
    if (!d) return;
    if (target && target !== d.from) applyMove(d.id, target);
  }

  // cancelamento (o navegador tomou o gesto pra rolagem, ligação entrou, etc.):
  // aborta TUDO sem nunca aplicar movimento — evita soltar o card em coluna errada.
  function onPointerCancel() {
    cancelPending();
    drag.current = null;
    stopAutoScroll();
    stopBlockScroll();
    setDragId(null);
    setGhost(null);
    setOver(null);
  }

  function applyMove(id: string, stage: string) {
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage } : c))); // otimista
    if (stage === "vendido") {
      setSaleValue("");
      setPendingSale(id);
    } else {
      startTransition(() => {
        moveLeadStage(id, stage);
      });
    }
  }

  function confirmSale(id: string) {
    const value = parseBRL(saleValue);
    setPendingSale(null);
    setSaleValue("");
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, value } : c)));
    startTransition(() => {
      moveLeadStage(id, "vendido", value);
    });
  }

  useEffect(
    () => () => {
      stopAutoScroll();
      stopBlockScroll();
      cancelPending();
    },
    [],
  );

  return (
    <>
      <div
        ref={scrollerRef}
        className="flex flex-col gap-3 pb-4 sm:flex-row sm:overflow-x-auto sm:overscroll-x-contain"
      >
        {ORDER.map((stage) => {
          const meta = STAGE_META[stage] ?? STAGE_META.novo;
          const col = cards.filter((c) => c.stage === stage);
          return (
            <div
              key={stage}
              data-stage={stage}
              className={`flex w-full shrink-0 flex-col rounded-xl border bg-pane/40 p-2 transition-colors sm:w-72 ${
                over === stage ? "border-signal/60 bg-signal-soft/30" : "border-line"
              }`}
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }}
                  />
                  {meta.label}
                </span>
                <span className="num text-xs text-faint">{col.length}</span>
              </div>

              <div className="flex min-h-12 flex-col gap-2">
                {col.map((c) => (
                  <div
                    key={c.id}
                    onPointerDown={(e) => onPointerDown(e, c)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    // pan-y: rolagem vertical nativa LIVRE — arrasto só após segurar (hold)
                    style={{ touchAction: "pan-y" }}
                    className={`card cursor-grab select-none p-3 transition-opacity active:cursor-grabbing ${
                      dragId === c.id ? "opacity-30" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {c.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.image} alt="" className="h-6 w-6 shrink-0 rounded border border-line object-cover" />
                      )}
                      <Link
                        href={`/painel/lead/${c.id}`}
                        className="truncate text-sm font-semibold transition-colors hover:text-signal"
                      >
                        {c.name ?? "Sem nome"}
                      </Link>
                    </div>

                    {c.campaign && <div className="mt-1 truncate text-xs text-faint">{c.campaign}</div>}

                    {pendingSale === c.id ? (
                      <div className="mt-2 flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={saleValue}
                          onChange={(e) => setSaleValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") confirmSale(c.id);
                          }}
                          inputMode="decimal"
                          placeholder="valor R$"
                          className="num w-24 rounded-lg border border-signal/60 bg-transparent px-2 py-1 text-xs placeholder:text-faint focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => confirmSale(c.id)}
                          className="btn btn-primary btn-sm"
                        >
                          Confirmar
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                          {c.stage === "vendido" && c.value != null && (
                            <span className="num font-bold text-signal">{brl.format(c.value)}</span>
                          )}
                          {c.stage === "agendado" && c.scheduled_at && (
                            <span className="num inline-flex items-center gap-1 text-st-agen">
                              <IconCalendar size={11} />
                              {formatSchedule(c.scheduled_at)}
                            </span>
                          )}
                        </div>

                        <Link
                          href={`/painel/lead/${c.id}`}
                          className="mt-2 inline-flex items-center gap-1 text-[11px] text-mist transition-colors hover:text-signal"
                        >
                          <IconChat size={11} /> abrir
                        </Link>
                      </>
                    )}
                  </div>
                ))}
                {col.length === 0 && (
                  <div className="rounded-lg border border-dashed border-line/60 py-6 text-center text-[11px] text-faint">
                    solte aqui
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* card flutuante "levantado" que segue o dedo durante o arraste */}
      {ghost && (
        <div
          className="card pointer-events-none fixed z-50 scale-105 rotate-2 !border-signal/50 p-3 text-sm font-semibold opacity-95 shadow-2xl"
          style={{ left: ghost.left, top: ghost.top, width: ghost.w }}
        >
          {ghost.name}
        </div>
      )}
    </>
  );
}

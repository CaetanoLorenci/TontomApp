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

type DragRef = { id: string; from: string; offX: number; offY: number; w: number; name: string; moved: boolean };
type Ghost = { left: number; top: number; w: number; name: string };

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
  const autoScroll = useRef<{ dir: number; raf: number } | null>(null);

  // Descobre o estágio sob um ponto da tela (hit-test robusto, considera o scroll).
  function stageAt(x: number, y: number): string | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const col = (el as HTMLElement).closest?.("[data-stage]");
      if (col) return col.getAttribute("data-stage");
    }
    return null;
  }

  function runAutoScroll() {
    const st = autoScroll.current;
    const sc = scrollerRef.current;
    if (!st || !sc) return;
    sc.scrollLeft += st.dir * 14;
    st.raf = requestAnimationFrame(runAutoScroll);
  }
  function setAutoScroll(dir: number) {
    if (autoScroll.current?.dir === dir) return;
    stopAutoScroll();
    if (dir === 0) return;
    autoScroll.current = { dir, raf: requestAnimationFrame(runAutoScroll) };
  }
  function stopAutoScroll() {
    if (autoScroll.current) {
      cancelAnimationFrame(autoScroll.current.raf);
      autoScroll.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent, card: PipelineCard) {
    if (pendingSale) return;
    // deixa links/botões/inputs do card funcionarem (abrir lead, confirmar venda)
    if ((e.target as HTMLElement).closest("a,button,input")) return;
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    drag.current = {
      id: card.id,
      from: card.stage,
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
      w: r.width,
      name: card.name ?? "Sem nome",
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
    setDragId(card.id);
    setOver(card.stage);
    setGhost({ left: r.left, top: r.top, w: r.width, name: drag.current.name });
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    d.moved = true;
    setGhost({ left: e.clientX - d.offX, top: e.clientY - d.offY, w: d.w, name: d.name });
    const s = stageAt(e.clientX, e.clientY);
    if (s) setOver(s);
    const sc = scrollerRef.current;
    if (sc) {
      const rect = sc.getBoundingClientRect();
      const EDGE = 56;
      if (e.clientX < rect.left + EDGE) setAutoScroll(-1);
      else if (e.clientX > rect.right - EDGE) setAutoScroll(1);
      else setAutoScroll(0);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    stopAutoScroll();
    setDragId(null);
    setGhost(null);
    const target = stageAt(e.clientX, e.clientY) ?? over;
    setOver(null);
    if (!d) return;
    if (d.moved && target && target !== d.from) applyMove(d.id, target);
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

  useEffect(() => () => stopAutoScroll(), []);

  return (
    <>
      <div ref={scrollerRef} className="flex gap-3 overflow-x-auto overscroll-x-contain pb-4">
        {ORDER.map((stage) => {
          const meta = STAGE_META[stage] ?? STAGE_META.novo;
          const col = cards.filter((c) => c.stage === stage);
          return (
            <div
              key={stage}
              data-stage={stage}
              className={`flex w-[78vw] max-w-72 shrink-0 flex-col rounded-xl border bg-pane/40 p-2 transition-colors sm:w-72 ${
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
                    onPointerCancel={onPointerUp}
                    style={{ touchAction: "none" }}
                    className={`card cursor-grab touch-none select-none p-3 transition-opacity active:cursor-grabbing ${
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
                          className="rounded-lg bg-signal px-2.5 py-1 text-xs font-semibold text-ink"
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

      {/* card flutuante que segue o dedo durante o arraste */}
      {ghost && (
        <div
          className="card pointer-events-none fixed z-50 rotate-2 p-3 text-sm font-semibold opacity-90 shadow-2xl"
          style={{ left: ghost.left, top: ghost.top, width: ghost.w }}
        >
          {ghost.name}
        </div>
      )}
    </>
  );
}

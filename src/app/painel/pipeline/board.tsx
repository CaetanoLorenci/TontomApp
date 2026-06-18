"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { moveLeadStage } from "../actions";
import { STAGE_META, brl, formatSchedule } from "@/lib/format";
import { IconCalendar, IconChat } from "@/components/icons";

// Kanban do funil: colunas por estágio, arrastar lead entre elas (move + dispara CAPI).
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

export function Board({ initial }: { initial: PipelineCard[] }) {
  const [cards, setCards] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pendingSale, setPendingSale] = useState<string | null>(null); // lead aguardando valor
  const [saleValue, setSaleValue] = useState("");
  const [, startTransition] = useTransition();

  function drop(stage: string) {
    const id = dragId;
    setDragId(null);
    setOver(null);
    if (!id) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage } : c))); // otimista
    if (stage === "vendido") {
      // pede o valor antes de persistir → o Purchase sai COM valor
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

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {ORDER.map((stage) => {
        const meta = STAGE_META[stage] ?? STAGE_META.novo;
        const col = cards.filter((c) => c.stage === stage);
        return (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(stage);
            }}
            onDragLeave={() => setOver((o) => (o === stage ? null : o))}
            onDrop={() => drop(stage)}
            className={`flex w-72 shrink-0 flex-col rounded-xl border bg-pane/40 p-2 transition-colors ${
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
                  draggable={pendingSale !== c.id}
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  className={`card cursor-grab p-3 transition-opacity active:cursor-grabbing ${
                    dragId === c.id ? "opacity-40" : ""
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
                      onClick={(e) => e.stopPropagation()}
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
                        onClick={(e) => e.stopPropagation()}
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
                  arraste aqui
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

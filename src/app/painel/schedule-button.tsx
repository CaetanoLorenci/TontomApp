"use client";

import { useState } from "react";
import { scheduleLead } from "./actions";
import { IconCalendar, IconClock, IconAdvance } from "@/components/icons";

/* Botão "Agendar" no card do lead: clica → escolhe o DIA (calendário) →
   aparece a HORA → confirma. Fluxo progressivo, fuso de Brasília no servidor. */
export function ScheduleButton({
  leadId,
  defaultValue,
  label = "Agendar",
}: {
  leadId: string;
  defaultValue?: string | null; // "YYYY-MM-DDTHH:mm" pré-preenchido (reagendar)
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultValue?.slice(0, 10) ?? "");
  const [time, setTime] = useState(defaultValue?.slice(11, 16) ?? "");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-line2 bg-pane2 px-3.5 py-1.5 text-sm font-medium text-snow transition-colors hover:border-st-agen/60 hover:text-st-agen"
      >
        <IconCalendar size={14} /> {label}
      </button>
    );
  }

  return (
    <form action={scheduleLead} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="scheduledAt" value={date && time ? `${date}T${time}` : ""} />

      <span className="flex items-center gap-1.5 rounded-xl border border-st-agen/40 bg-st-agen/5 px-2.5 py-1.5 text-sm text-st-agen">
        <IconCalendar size={14} />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          autoFocus
          style={{ colorScheme: "dark" }}
          className="num bg-transparent text-snow focus:outline-none"
        />
      </span>

      {date && (
        <span className="flex items-center gap-1.5 rounded-xl border border-st-agen/40 bg-st-agen/5 px-2.5 py-1.5 text-sm text-st-agen">
          <IconClock size={14} />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            style={{ colorScheme: "dark" }}
            className="num bg-transparent text-snow focus:outline-none"
          />
        </span>
      )}

      {date && time && (
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-xl bg-st-agen px-3.5 py-1.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]"
        >
          <IconAdvance size={14} /> Confirmar
        </button>
      )}

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-xl border border-line px-2.5 py-1.5 text-sm text-faint transition-colors hover:text-snow"
        aria-label="cancelar"
      >
        ✕
      </button>
    </form>
  );
}

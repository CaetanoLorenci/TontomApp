// Helpers de calendário: link "Adicionar ao Google Agenda" + grade do mês.

// Date -> "YYYYMMDDTHHMMSSZ" (formato do Google Calendar, em UTC).
function fmtUTC(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Gera o link de "Adicionar ao Google Agenda" (pré-preenchido, abre no Google).
export function googleCalUrl(opts: {
  title: string;
  startIso: string;
  durationMin?: number;
  details?: string;
}): string {
  const start = new Date(opts.startIso);
  const end = new Date(start.getTime() + (opts.durationMin ?? 60) * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${fmtUTC(start)}/${fmtUTC(end)}`,
  });
  if (opts.details) params.set("details", opts.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Constrói a grade de 6 semanas (42 dias) de um mês. Datas como "YYYY-MM-DD"
// (rótulo de dia do calendário) pra casar com brDayKey dos agendamentos.
export function monthGrid(year: number, month1: number): {
  days: { key: string; day: number; inMonth: boolean }[];
  label: string;
  prev: string;
  next: string;
} {
  const first = new Date(Date.UTC(year, month1 - 1, 1, 12));
  const startDow = first.getUTCDay(); // 0=domingo
  const gridStart = new Date(first.getTime() - startDow * 86_400_000);

  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart.getTime() + i * 86_400_000);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const key = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { key, day, inMonth: m === month1 && y === year };
  });

  const label = new Date(Date.UTC(year, month1 - 1, 1, 12)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const pm = month1 === 1 ? { y: year - 1, m: 12 } : { y: year, m: month1 - 1 };
  const nm = month1 === 12 ? { y: year + 1, m: 1 } : { y: year, m: month1 + 1 };
  const fmt = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  return { days, label, prev: fmt(pm.y, pm.m), next: fmt(nm.y, nm.m) };
}

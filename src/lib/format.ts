// Formatação compartilhada do painel.

export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatPhone(p: string): string {
  const m = p.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : p;
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return sameDay
    ? `hoje ${hm}`
    : `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} ${hm}`;
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

// ── Agendamento (fuso Brasil) ──────────────────────────────
// Brasil não tem horário de verão desde 2019 → offset fixo -03:00.
// O servidor da Vercel roda em UTC, então TUDO que envolve horário de
// compromisso precisa fixar o fuso, senão a agenda mostra 3h errada.
export const BR_TZ = "America/Sao_Paulo";
export const BR_OFFSET = "-03:00";

// "2026-06-18T15:30" (datetime-local, hora de Brasília) → ISO UTC pra gravar.
export function brLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00${BR_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ISO (UTC) → "18/06 15:30" pré-preenchido pro input datetime-local (hora BR).
export function isoToBrLocalInput(iso: string): string {
  // pega os campos já no fuso BR e remonta no formato do input
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: BR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

// ISO → "qua, 18 jun · 15:30" (hora de Brasília).
export function formatSchedule(iso: string): string {
  return new Date(iso)
    .toLocaleString("pt-BR", {
      timeZone: BR_TZ,
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "")
    .replace(/(\d{2}:\d{2})$/, "· $1");
}

// Chave de dia (YYYY-MM-DD no fuso BR) — pra agrupar a agenda.
export function brDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BR_TZ }).format(d);
}

// só o horário "15:30" (BR) — usado dentro de um grupo de dia.
export function formatTimeBR(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: BR_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

// rótulo de cabeçalho de dia "quarta, 18 de junho" (BR).
export function formatDayLongBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: BR_TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export const STAGE_META: Record<string, { label: string; color: string }> = {
  novo: { label: "Novo", color: "var(--color-st-novo)" },
  qualificado: { label: "Qualificado", color: "var(--color-st-qual)" },
  agendado: { label: "Agendado", color: "var(--color-st-agen)" },
  vendido: { label: "Vendido", color: "var(--color-st-vend)" },
  perdido: { label: "Perdido", color: "var(--color-st-perd)" },
};

export const NEXT_ACTIONS: Record<string, string[]> = {
  novo: ["qualificado", "agendado", "perdido"],
  qualificado: ["agendado", "vendido", "perdido"],
  agendado: ["vendido", "perdido"],
  vendido: [],
  perdido: ["novo"],
};

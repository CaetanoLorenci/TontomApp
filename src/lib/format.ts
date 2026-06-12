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

export const STAGE_META: Record<string, { label: string; color: string }> = {
  novo: { label: "Novo", color: "var(--color-st-novo)" },
  qualificado: { label: "Qualificado", color: "var(--color-st-qual)" },
  agendado: { label: "Agendado", color: "var(--color-st-agen)" },
  vendido: { label: "Vendido", color: "var(--color-st-vend)" },
  perdido: { label: "Perdido", color: "var(--color-st-perd)" },
};

export const NEXT_ACTIONS: Record<string, string[]> = {
  novo: ["qualificado", "perdido"],
  qualificado: ["agendado", "vendido", "perdido"],
  agendado: ["vendido", "perdido"],
  vendido: [],
  perdido: ["novo"],
};

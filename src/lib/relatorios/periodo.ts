// Resolve o período do relatório a partir dos parâmetros da URL.
// Atalhos: este-mes (padrão) · mes-passado · 7d · 30d
// Livre: ?since=YYYY-MM-DD&until=YYYY-MM-DD  (o cliente pede o período que quiser)

import { BR_TZ } from "@/lib/format";

export type Periodo = { since: string; until: string; label: string; preset: string };

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const dmShort = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

// "hoje" no fuso de Brasília (o servidor roda em UTC).
function hojeBR(): { y: number; m: number; d: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: BR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { y: g("year"), m: g("month"), d: g("day") };
}

const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function resolvePeriodo(params: { preset?: string; since?: string; until?: string }): Periodo {
  // período livre (de/até)
  if (params.since && params.until && ISO.test(params.since) && ISO.test(params.until)) {
    const [since, until] = params.since <= params.until ? [params.since, params.until] : [params.until, params.since];
    return { since, until, preset: "custom", label: `${dmShort(since)} a ${dmShort(until)}` };
  }

  const { y, m, d } = hojeBR();
  const preset = ["este-mes", "mes-passado", "7d", "30d"].includes(params.preset ?? "")
    ? (params.preset as string)
    : "este-mes";

  if (preset === "mes-passado") {
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return {
      since: ymd(py, pm, 1),
      until: ymd(py, pm, ultimoDia(py, pm)),
      preset,
      label: `${MESES[pm - 1]} de ${py}`,
    };
  }

  if (preset === "7d" || preset === "30d") {
    const dias = preset === "7d" ? 7 : 30;
    const fim = new Date(Date.UTC(y, m - 1, d));
    const ini = new Date(fim.getTime() - (dias - 1) * 86_400_000);
    const since = ymd(ini.getUTCFullYear(), ini.getUTCMonth() + 1, ini.getUTCDate());
    const until = ymd(y, m, d);
    return { since, until, preset, label: `últimos ${dias} dias` };
  }

  // este-mes (padrão)
  return {
    since: ymd(y, m, 1),
    until: ymd(y, m, d),
    preset: "este-mes",
    label: `${MESES[m - 1]} de ${y}`,
  };
}

export const PRESETS: { key: string; label: string }[] = [
  { key: "este-mes", label: "Este mês" },
  { key: "mes-passado", label: "Mês passado" },
  { key: "30d", label: "30 dias" },
  { key: "7d", label: "7 dias" },
];
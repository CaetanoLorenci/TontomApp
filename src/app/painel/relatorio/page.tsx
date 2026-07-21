import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";
import { PanelNav } from "@/components/panel-nav";
import { CopyShare } from "@/components/copy-share";
import {
  reportInsights,
  campaignBreakdown,
  buildWhatsAppReport,
  type ManagedAccount,
} from "@/lib/gestor";

export const dynamic = "force-dynamic";

/* Relatório pronto por conta — formato WhatsApp, período flexível.
   Presets (7/14/30 dias, mês atual) + intervalo livre; comparação sempre com o
   período equivalente ANTERIOR. Objetivo e métricas extras por conta ficam na
   calibragem da própria conta (Contas → abrir → Calibragem). */

const PRESETS: Record<string, { label: string; days: number }> = {
  "7d": { label: "7 dias", days: 7 },
  "14d": { label: "14 dias", days: 14 },
  "30d": { label: "30 dias", days: 30 },
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const brDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function resolvePeriod(p?: string, sinceQ?: string, untilQ?: string) {
  const today = new Date();
  const day = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };
  const okDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

  // intervalo livre
  if (p === "custom" && okDate(sinceQ) && okDate(untilQ) && sinceQ! <= untilQ!) {
    const since = sinceQ!;
    const until = untilQ!;
    const len = Math.round((Date.parse(until) - Date.parse(since)) / 86400000) + 1;
    const prevUntil = isoDay(new Date(Date.parse(since) - 86400000));
    const prevSince = isoDay(new Date(Date.parse(since) - len * 86400000));
    return { key: "custom", since, until, prevSince, prevUntil, label: `Período: ${brDay(since)} a ${brDay(until)}` };
  }

  // mês atual (dia 1 → ontem; comparação = mesmo nº de dias do mês anterior)
  if (p === "mes") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const until = isoDay(day(1));
    const since = isoDay(first);
    const len = Math.round((Date.parse(until) - Date.parse(since)) / 86400000) + 1;
    const prevUntil = isoDay(new Date(Date.parse(since) - 86400000));
    const prevSince = isoDay(new Date(Date.parse(since) - len * 86400000));
    return { key: "mes", since, until, prevSince, prevUntil, label: `Mês atual (${brDay(since)} a ${brDay(until)})` };
  }

  // presets em dias (até ontem)
  const preset = PRESETS[p ?? "7d"] ? (p ?? "7d") : "7d";
  const n = PRESETS[preset].days;
  const since = isoDay(day(n));
  const until = isoDay(day(1));
  const prevSince = isoDay(day(n * 2));
  const prevUntil = isoDay(day(n + 1));
  return { key: preset, since, until, prevSince, prevUntil, label: `Últimos ${PRESETS[preset].label} (${brDay(since)} a ${brDay(until)})` };
}

export default async function Relatorio({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; since?: string; until?: string }>;
}) {
  const { p, since: sinceQ, until: untilQ } = await searchParams;
  const { seesAll } = await getScope();
  if (!seesAll) notFound();

  const period = resolvePeriod(p, sinceQ, untilQ);

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("managed_accounts")
    .select(
      "id, act_id, client_name, monthly_budget, target_cpa, notes, active, next_action, next_action_at, objective, report_metrics, client_goal, target_note",
    )
    .eq("active", true)
    .order("client_name", { ascending: true });
  const accounts = (data ?? []) as ManagedAccount[];

  const reports = await Promise.all(
    accounts.map(async (a) => {
      const [cur, prev, camps] = await Promise.all([
        reportInsights(a.act_id, period.since, period.until, a.objective),
        reportInsights(a.act_id, period.prevSince, period.prevUntil, a.objective),
        campaignBreakdown(a.act_id, { since: period.since, until: period.until, objective: a.objective }),
      ]);
      const ok = cur.spend > 0 || cur.impressions > 0 || prev.spend > 0;
      return { account: a, ok, text: buildWhatsAppReport(a, cur, prev, camps, period.label) };
    }),
  );

  const chip = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${on ? "bg-signal-soft text-signal" : "text-mist hover:text-snow"}`;

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />
      <PanelNav active="relatorio" seesAll={seesAll} />

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        <h1 className="font-head text-2xl font-extrabold tracking-tight">Relatório</h1>
        <p className="mt-1 text-sm text-mist">{period.label} · comparado com o período anterior equivalente.</p>

        {/* período: presets + intervalo livre */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <nav className="inline-flex items-center gap-1 rounded-xl border border-line bg-pane p-1">
            {Object.entries(PRESETS).map(([k, v]) => (
              <Link key={k} href={`/painel/relatorio?p=${k}`} className={chip(period.key === k)}>
                {v.label}
              </Link>
            ))}
            <Link href="/painel/relatorio?p=mes" className={chip(period.key === "mes")}>
              Mês atual
            </Link>
          </nav>
          <form method="get" action="/painel/relatorio" className="flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="p" value="custom" />
            <input
              type="date"
              name="since"
              defaultValue={period.key === "custom" ? period.since : ""}
              required
              style={{ colorScheme: "dark" }}
              className="num rounded-xl border border-line bg-pane px-2.5 py-1.5 text-xs focus:border-signal/60 focus:outline-none"
            />
            <span className="text-xs text-faint">até</span>
            <input
              type="date"
              name="until"
              defaultValue={period.key === "custom" ? period.until : ""}
              required
              style={{ colorScheme: "dark" }}
              className="num rounded-xl border border-line bg-pane px-2.5 py-1.5 text-xs focus:border-signal/60 focus:outline-none"
            />
            <button type="submit" className="btn btn-ghost btn-sm">Aplicar</button>
          </form>
        </div>

        {reports.length === 0 ? (
          <div className="card mt-4 border-dashed p-8 text-center text-sm text-faint">
            Nenhuma conta cadastrada — adiciona em Contas e o relatório nasce aqui.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {reports.map((r) => (
              <section key={r.account.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">
                    {r.account.client_name}
                    <Link
                      href={`/painel/contas/${r.account.id}`}
                      className="ml-2 text-[11px] font-normal text-faint underline hover:text-signal"
                    >
                      calibrar métricas
                    </Link>
                  </h2>
                  <CopyShare text={r.text} />
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-line/60 bg-pane2/60 p-3.5 font-sans text-sm leading-relaxed text-mist">
                  {r.text}
                </pre>
                {!r.ok && (
                  <p className="mt-2 text-[11px] text-st-agen">
                    ⚠ sem movimento no período (ou token sem acesso) — confere o intervalo escolhido.
                  </p>
                )}
              </section>
            ))}
          </div>
        )}

        <p className="mt-5 text-[11px] text-faint">
          O objetivo (compras/leads/conversas) e as métricas extras (impressões, cliques, CTR, CPM) de cada conta são
          configurados em “calibrar métricas”. Revisa a “Leitura” antes de enviar — você é o gestor.
        </p>
      </div>
    </main>
  );
}

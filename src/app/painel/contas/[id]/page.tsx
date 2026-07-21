import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";
import { PanelNav } from "@/components/panel-nav";
import { accountHealth, campaignBreakdown, dailySeries, type ManagedAccount } from "@/lib/gestor";
import { removeManagedAccount, setAccountAction, clearAccountAction, updateAccountSettings } from "../../actions";
import { brl } from "@/lib/format";
import { CostTrend } from "../trend";

export const dynamic = "force-dynamic";

/* Detalhe da conta gerenciada: o card da lista é a triagem; AQUI é a decisão.
   Períodos com respiro, quebra por campanha (o que puxa o custo), próxima ação,
   verba/custo-alvo e notas — tudo da conta num lugar só. */

const LEVEL_META = {
  red: { label: "agir agora", color: "var(--color-st-perd)" },
  yellow: { label: "de olho", color: "var(--color-st-agen)" },
  green: { label: "rodando bem", color: "var(--color-st-vend)" },
} as const;

const brDayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default async function ContaDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { seesAll } = await getScope();
  if (!seesAll) notFound();

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("managed_accounts")
    .select("id, act_id, client_name, monthly_budget, target_cpa, notes, active, next_action, next_action_at, objective, report_metrics")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const account = data as ManagedAccount;

  const [h, campaigns, daily] = await Promise.all([
    accountHealth(account),
    campaignBreakdown(account.act_id),
    dailySeries(account.act_id, account.objective),
  ]);
  const meta = LEVEL_META[h.level];

  const cpa = (spend: number, results: number) => (results > 0 ? spend / results : null);
  const cpaY = cpa(h.yesterday.spend, h.yesterday.results);
  const cpa7 = cpa(h.d7.spend, h.d7.results);
  const cpa30 = cpa(h.d30.spend, h.d30.results);
  const cpaPrev7 = cpa(h.prev7.spend, h.prev7.results);

  const periods = [
    { label: "Ontem", spend: h.yesterday.spend, results: h.yesterday.results, rl: h.yesterday.resultLabel, cpa: cpaY, trend: null as null | { cur: number | null; prev: number | null } },
    { label: "7 dias", spend: h.d7.spend, results: h.d7.results, rl: h.d7.resultLabel, cpa: cpa7, trend: { cur: cpa7, prev: cpaPrev7 } },
    { label: "Semana anterior", spend: h.prev7.spend, results: h.prev7.results, rl: h.prev7.resultLabel, cpa: cpaPrev7, trend: null },
    { label: "30 dias", spend: h.d30.spend, results: h.d30.results, rl: h.d30.resultLabel, cpa: cpa30, trend: null },
  ];

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />
      <PanelNav active="contas" />

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
        <Link href="/painel/contas" className="text-sm text-mist transition-colors hover:text-snow">
          ← Contas
        </Link>

        {/* cabeçalho */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} />
          <h1 className="font-head text-2xl font-extrabold tracking-tight">{account.client_name}</h1>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
            style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
          >
            {meta.label}
          </span>
          <form action={removeManagedAccount} className="ml-auto">
            <input type="hidden" name="id" value={account.id} />
            <button type="submit" className="text-[11px] text-faint underline hover:text-st-perd">remover conta</button>
          </form>
        </div>
        <p className="num mt-1 text-xs text-faint">
          act_{account.act_id}
          {h.accountName ? ` · ${h.accountName}` : ""} · status {h.status === 1 ? "ativa" : `⚠ ${h.status}`}
          {h.balanceValue != null && <> · saldo <strong className="text-snow">{brl.format(h.balanceValue)}</strong></>}
        </p>

        {/* por que essa cor */}
        <ul className="mt-3 space-y-1 text-sm" style={{ color: h.level === "green" ? "var(--color-mist)" : meta.color }}>
          {h.reasons.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>

        {/* períodos com respiro */}
        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {periods.map((p) => (
            <div key={p.label} className="card p-4">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-faint">{p.label}</div>
              <div className="num mt-2 text-xl font-bold">{brl.format(p.spend)}</div>
              <div className="num mt-1 text-xs text-mist">
                {p.results > 0 ? (
                  <>
                    {p.results} {p.rl}
                    {p.cpa != null && (
                      <>
                        {" "}· <strong className="text-snow">{brl.format(p.cpa)}</strong>/res{" "}
                        {p.trend && <CostTrend cur={p.trend.cur} prev={p.trend.prev} />}
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-faint">sem resultados</span>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* ritmo diário: a queda de entrega aparece na curva antes de aparecer no agregado */}
        {daily.some((d) => d.spend > 0) && (
          <section className="card mt-4 p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">
              Gasto por dia — últimos 14 dias
            </h2>
            {(() => {
              const max = Math.max(...daily.map((d) => d.spend));
              const W = 14 * 22; // 14 barras × (18 + 4 de respiro)
              const H = 72;
              return (
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  className="mt-3 h-24 w-full"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Gasto diário dos últimos 14 dias"
                >
                  {daily.map((d, i) => {
                    const hh = max > 0 ? Math.max((d.spend / max) * (H - 6), 2) : 2;
                    const zero = d.spend === 0;
                    return (
                      <rect
                        key={d.date}
                        x={i * 22 + 2}
                        y={H - hh}
                        width={18}
                        height={hh}
                        rx={3}
                        fill={zero ? "var(--color-line)" : "var(--color-signal)"}
                        opacity={zero ? 0.6 : i === daily.length - 1 ? 1 : 0.75}
                      >
                        <title>
                          {`${brDayLabel(d.date)} · ${brl.format(d.spend)}${d.results > 0 ? ` · ${d.results} resultado${d.results > 1 ? "s" : ""}` : ""}`}
                        </title>
                      </rect>
                    );
                  })}
                </svg>
              );
            })()}
            <div className="num mt-1.5 flex justify-between text-[10px] text-faint">
              <span>{brDayLabel(daily[0].date)}</span>
              <span>pico {brl.format(Math.max(...daily.map((d) => d.spend)))}</span>
              <span>{brDayLabel(daily[daily.length - 1].date)} (ontem)</span>
            </div>
          </section>
        )}

        {/* campanhas: o que puxa o custo (7d) */}
        <section className="card mt-4 p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Campanhas — últimos 7 dias</h2>
          {campaigns.length === 0 ? (
            <p className="mt-3 text-sm text-faint">Nenhuma campanha com gasto no período.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {campaigns.slice(0, 10).map((c) => {
                const ccpa = c.results > 0 ? c.spend / c.results : null;
                return (
                  <div key={c.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line/40 pb-2 text-sm last:border-0 last:pb-0">
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="num shrink-0 text-xs text-mist">
                      <strong className="text-snow">{brl.format(c.spend)}</strong>
                      {c.results > 0 ? (
                        <>
                          {" "}· {c.results} {c.resultLabel} · <strong className="text-snow">{ccpa != null ? brl.format(ccpa) : "—"}</strong>/res
                        </>
                      ) : (
                        <span className="text-st-perd"> · sem resultado</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* próxima ação */}
        <section className="card mt-4 p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Próxima ação</h2>
          {account.next_action ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-signal-soft px-3 py-1.5 text-sm font-semibold text-signal">
                → {account.next_action}
              </span>
              <form action={clearAccountAction}>
                <input type="hidden" name="id" value={account.id} />
                <button type="submit" className="btn btn-ghost btn-sm">✓ feito</button>
              </form>
            </div>
          ) : (
            <form action={setAccountAction} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="id" value={account.id} />
              <input
                name="action"
                placeholder="ex.: subir criativo novo na quarta"
                className="min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
              />
              <button type="submit" className="btn btn-primary shrink-0">salvar</button>
            </form>
          )}
        </section>

        {/* calibragem + notas */}
        <section className="card mt-4 p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Calibragem & notas</h2>
          <form action={updateAccountSettings} className="mt-3 space-y-2">
            <input type="hidden" name="id" value={account.id} />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-mist">
                Verba/mês (R$)
                <input
                  name="budget"
                  defaultValue={account.monthly_budget ?? ""}
                  inputMode="decimal"
                  placeholder="ex.: 1500"
                  className="num mt-1 w-full rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
                />
              </label>
              <label className="text-xs text-mist">
                Custo-alvo por resultado (R$)
                <input
                  name="targetCpa"
                  defaultValue={account.target_cpa ?? ""}
                  inputMode="decimal"
                  placeholder="vazio = média da própria conta"
                  className="num mt-1 w-full rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
                />
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-mist">
                Objetivo da conta (o que conta como resultado no semáforo e no relatório)
                <select
                  name="objective"
                  defaultValue={account.objective ?? "auto"}
                  style={{ colorScheme: "dark" }}
                  className="mt-1 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none"
                >
                  <option value="auto">Auto (detecta: compra &gt; lead &gt; conversa)</option>
                  <option value="compras">Compras</option>
                  <option value="leads">Leads</option>
                  <option value="conversas">Conversas iniciadas</option>
                </select>
              </label>
              <fieldset className="text-xs text-mist">
                <legend>Métricas extras no relatório</legend>
                <div className="mt-1 grid grid-cols-2 gap-1.5 rounded-xl border border-line px-3 py-2">
                  {[
                    ["impressoes", "Impressões"],
                    ["cliques", "Cliques"],
                    ["ctr", "CTR"],
                    ["cpm", "CPM"],
                  ].map(([v, l]) => (
                    <label key={v} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        name="metrics"
                        value={v}
                        defaultChecked={(account.report_metrics ?? []).includes(v)}
                        className="accent-[var(--color-signal)]"
                      />
                      {l}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <label className="block text-xs text-mist">
              Notas da conta (particularidades, combinados, aprendizados)
              <textarea
                name="notes"
                defaultValue={account.notes ?? ""}
                rows={3}
                className="mt-1 w-full rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
              />
            </label>
            <button type="submit" className="btn btn-ghost">Salvar ajustes</button>
          </form>
        </section>
      </div>
    </main>
  );
}

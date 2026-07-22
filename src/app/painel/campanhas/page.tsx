import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";
import { PanelNav } from "@/components/panel-nav";
import { allAccountsHealth, accountCampaignsOverview, type ManagedAccount, type CampaignOverview } from "@/lib/gestor";
import { brl } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* HOME — "Gerenciador multi-conta": as campanhas de TODAS as contas numa tela,
   curadas (só o que roda ou gastou), conta mais urgente primeiro. Bate o olho →
   entra na conta que precisa. A média esconde o extremo; aqui é a QUEBRA. */

const LEVEL_META = {
  red: { label: "agir agora", color: "var(--color-st-perd)" },
  yellow: { label: "de olho", color: "var(--color-st-agen)" },
  green: { label: "rodando bem", color: "var(--color-st-vend)" },
} as const;

export default async function Campanhas() {
  const { seesAll } = await getScope();
  if (!seesAll) notFound();

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("managed_accounts")
    .select(
      "id, act_id, client_name, monthly_budget, target_cpa, notes, active, next_action, next_action_at, objective, report_metrics, client_goal, target_note, weekend_only, auto_recharge",
    )
    .eq("active", true);
  const accounts = (data ?? []) as ManagedAccount[];
  const health = await allAccountsHealth(accounts); // já ordenado por urgência
  const overviews = new Map<string, CampaignOverview[]>(
    await Promise.all(
      health.map(async (h) => [h.account.id, await accountCampaignsOverview(h.account.act_id, h.account.objective)] as [string, CampaignOverview[]]),
    ),
  );

  const totY = health.reduce((s, h) => s + h.yesterday.spend, 0);
  const tot7 = health.reduce((s, h) => s + h.d7.spend, 0);
  const counts = { red: 0, yellow: 0, green: 0 };
  for (const h of health) counts[h.level]++;
  const flags = [...overviews.values()].flat().filter((c) => c.noResult).length;

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />
      <PanelNav active="campanhas" seesAll={seesAll} />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-head text-2xl font-extrabold tracking-tight">Campanhas</h1>
          <span className="num text-xs text-mist">
            <span className="text-st-perd">{counts.red} agir</span> ·{" "}
            <span className="text-st-agen">{counts.yellow} de olho</span> ·{" "}
            <span className="text-st-vend">{counts.green} ok</span>
          </span>
        </div>
        <p className="mt-1 text-sm text-mist">
          Todas as campanhas rodando, conta mais urgente primeiro — bateu o olho, entra onde precisa.
        </p>

        {/* pulso geral */}
        <div className="card mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-3">
          <span className="num text-xs text-mist">
            investido ontem <strong className="text-base text-snow">{brl.format(totY)}</strong>
          </span>
          <span className="num text-xs text-mist">
            7 dias <strong className="text-base text-snow">{brl.format(tot7)}</strong>
          </span>
          {flags > 0 && (
            <span className="num text-xs font-semibold text-st-perd">
              ⚑ {flags} campanha{flags > 1 ? "s" : ""} gastando sem resultado
            </span>
          )}
          <span className="num ml-auto text-[11px] text-faint">{health.length} contas</span>
        </div>

        <div className="mt-4 space-y-4">
          {health.map((h) => {
            const meta = LEVEL_META[h.level];
            const camps = overviews.get(h.account.id) ?? [];
            return (
              <section
                key={h.account.id}
                className="card p-4"
                style={{ borderColor: `color-mix(in srgb, ${meta.color} 40%, var(--color-line))` }}
              >
                {/* cabeçalho da conta: quem + estado + dinheiro — clique abre o detalhe */}
                <Link href={`/painel/contas/${h.account.id}`} className="flex flex-wrap items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
                  <span className="font-semibold text-snow">{h.account.client_name}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
                  >
                    {meta.label}
                  </span>
                  <span className="num text-[11px] text-faint">
                    {h.funding.kind === "prepago" && h.balanceValue != null && <>saldo {brl.format(h.balanceValue)}</>}
                    {h.funding.kind === "cartao" && <>💳 {h.funding.label}</>}
                  </span>
                  <span className="ml-auto text-faint">→</span>
                </Link>
                {h.level !== "green" && (
                  <p className="mt-1 text-xs" style={{ color: meta.color }}>
                    {h.reasons[0]}
                  </p>
                )}

                {/* a quebra: campanhas curadas (rodando ou com gasto na semana) */}
                {camps.length === 0 ? (
                  <p className="mt-2 text-sm text-faint">Nenhuma campanha ativa nem com gasto nos últimos 7 dias.</p>
                ) : (
                  <div className="mt-2.5 overflow-x-auto">
                    <table className="w-full min-w-[540px] text-sm">
                      <thead>
                        <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-faint">
                          <th className="py-1 pr-3 font-semibold">Campanha</th>
                          <th className="num py-1 pr-3 text-right font-semibold">Ontem</th>
                          <th className="num py-1 pr-3 text-right font-semibold">7 dias</th>
                          <th className="num py-1 pr-3 text-right font-semibold">Resultados</th>
                          <th className="num py-1 text-right font-semibold">R$/res</th>
                        </tr>
                      </thead>
                      <tbody>
                        {camps.map((c) => {
                          const cpa7 = c.results7 > 0 ? c.spend7 / c.results7 : null;
                          return (
                            <tr key={c.id} className={`border-t border-line/40 ${c.active ? "" : "opacity-50"}`}>
                              <td className="max-w-[280px] py-1.5 pr-3">
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{ background: c.active ? "var(--color-st-vend)" : "var(--color-line)" }}
                                    title={c.active ? "ativa" : "pausada"}
                                  />
                                  <span className="truncate">{c.name}</span>
                                  {c.noResult && (
                                    <span className="shrink-0 rounded-full bg-st-perd/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-st-perd">
                                      sem resultado
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="num py-1.5 pr-3 text-right text-mist">{c.ySpend > 0 ? brl.format(c.ySpend) : "—"}</td>
                              <td className="num py-1.5 pr-3 text-right text-snow">{c.spend7 > 0 ? brl.format(c.spend7) : "—"}</td>
                              <td className="num py-1.5 pr-3 text-right text-mist">
                                {c.results7 > 0 ? `${c.results7} ${c.resultLabel ?? ""}` : <span className="text-faint">0</span>}
                              </td>
                              <td className={`num py-1.5 text-right ${c.noResult ? "text-st-perd" : "text-snow"}`}>
                                {cpa7 != null ? brl.format(cpa7) : c.noResult ? "∞" : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <p className="mt-5 text-[11px] text-faint">
          Curadoria: só campanhas ativas ou com gasto em 7 dias; problema (gastando sem resultado) aparece primeiro.
          Pausadas com gasto recente ficam esmaecidas. Clique na conta pra ver períodos, timeline e calibragem.
        </p>
      </div>
    </main>
  );
}

import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";
import { PanelNav } from "@/components/panel-nav";
import { allAccountsHealth, type ManagedAccount } from "@/lib/gestor";
import { addManagedAccount, removeManagedAccount } from "../actions";
import { brl } from "@/lib/format";

export const dynamic = "force-dynamic";

/* Hub Gestor — o "semáforo da manhã": todas as contas gerenciadas numa tela só,
   ordenadas por urgência (vermelho age agora → verde tá ok), com o MOTIVO legível.
   Substitui abrir o Gerenciador conta a conta. Só Amplia (gestor). */

const LEVEL_META = {
  red: { label: "agir agora", color: "var(--color-st-perd)" },
  yellow: { label: "de olho", color: "var(--color-st-agen)" },
  green: { label: "rodando bem", color: "var(--color-st-vend)" },
} as const;

export default async function Contas() {
  const { seesAll } = await getScope();
  if (!seesAll) notFound();

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("managed_accounts")
    .select("id, act_id, client_name, monthly_budget, target_cpa, notes, active")
    .eq("active", true)
    .order("created_at", { ascending: true });
  const accounts = (data ?? []) as ManagedAccount[];
  const health = await allAccountsHealth(accounts);

  const counts = { red: 0, yellow: 0, green: 0 };
  for (const h of health) counts[h.level]++;

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />
      <PanelNav active="contas" seesAll={seesAll} />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-head text-2xl font-extrabold tracking-tight">Contas</h1>
          {health.length > 0 && (
            <span className="num text-xs text-mist">
              <span className="text-st-perd">{counts.red} agir</span> ·{" "}
              <span className="text-st-agen">{counts.yellow} de olho</span> ·{" "}
              <span className="text-st-vend">{counts.green} ok</span>
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-mist">
          Todas as contas gerenciadas numa tela — o que precisa de ação aparece primeiro, com o motivo.
        </p>

        {/* cadastrar conta */}
        <section className="card mt-5 p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Adicionar conta</h2>
          <form action={addManagedAccount} className="mt-3 grid gap-2 sm:grid-cols-4">
            <input
              name="actId"
              required
              placeholder="act_123… ou ID"
              className="num rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
            />
            <input
              name="clientName"
              required
              placeholder="Nome do cliente"
              className="rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
            />
            <input
              name="budget"
              placeholder="Verba/mês R$ (opcional)"
              inputMode="decimal"
              className="num rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
            />
            <div className="flex gap-2">
              <input
                name="targetCpa"
                placeholder="Custo-alvo R$ (opcional)"
                inputMode="decimal"
                className="num min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
              />
              <button type="submit" className="btn btn-primary shrink-0">
                Adicionar
              </button>
            </div>
          </form>
          <p className="mt-2 text-[11px] text-faint">
            Sem custo-alvo, o semáforo compara com a média da própria conta (30d). O token precisa ter acesso à conta
            (BM da Optimize → env <code className="text-signal">META_GESTOR_TOKEN</code>; senão usa o da Amplia).
          </p>
        </section>

        {/* semáforo */}
        {health.length === 0 ? (
          <div className="card mt-4 border-dashed p-8 text-center text-sm text-faint">
            Nenhuma conta cadastrada ainda — adiciona a primeira acima e o semáforo nasce aqui.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {health.map((h) => {
              const meta = LEVEL_META[h.level];
              const y = h.yesterday;
              const d7 = h.d7;
              const cpaY = y.results > 0 ? y.spend / y.results : null;
              const cpa7 = d7.results > 0 ? d7.spend / d7.results : null;
              return (
                <div key={h.account.id} className="card p-4" style={{ borderColor: `color-mix(in srgb, ${meta.color} 45%, var(--color-line))` }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
                    <span className="font-semibold">{h.account.client_name}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
                    >
                      {meta.label}
                    </span>
                    <span className="num text-[11px] text-faint">
                      act_{h.account.act_id}
                      {h.accountName ? ` · ${h.accountName}` : ""}
                    </span>
                    <form action={removeManagedAccount} className="ml-auto">
                      <input type="hidden" name="id" value={h.account.id} />
                      <button type="submit" className="text-[11px] text-faint underline hover:text-st-perd">remover</button>
                    </form>
                  </div>

                  {/* interpretação primeiro — o número explica, não lidera */}
                  <ul className="mt-2 space-y-0.5 text-sm" style={{ color: h.level === "green" ? "var(--color-mist)" : meta.color }}>
                    {h.reasons.map((r) => (
                      <li key={r}>• {r}</li>
                    ))}
                  </ul>

                  {h.ok && (
                    <div className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-mist sm:grid-cols-4">
                      <span>
                        ontem <strong className="text-snow">{brl.format(y.spend)}</strong>
                        {y.results > 0 && (
                          <>
                            {" "}· {y.results} {y.resultLabel}
                            {cpaY != null && <> · {brl.format(cpaY)}/res</>}
                          </>
                        )}
                      </span>
                      <span>
                        7d <strong className="text-snow">{brl.format(d7.spend)}</strong>
                        {d7.results > 0 && (
                          <>
                            {" "}· {d7.results} {d7.resultLabel}
                            {cpa7 != null && <> · {brl.format(cpa7)}/res</>}
                          </>
                        )}
                      </span>
                      <span>
                        30d <strong className="text-snow">{brl.format(h.d30.spend)}</strong>
                        {h.d30.results > 0 && <> · {h.d30.results} {h.d30.resultLabel}</>}
                      </span>
                      <span>
                        {h.balanceValue != null ? (
                          <>saldo <strong className="text-snow">{brl.format(h.balanceValue)}</strong></>
                        ) : (
                          <span className="text-faint">pós-pago / sem saldo exposto</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

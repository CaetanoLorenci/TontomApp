import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";
import { PanelNav } from "@/components/panel-nav";
import Link from "next/link";
import { allAccountsHealth, type ManagedAccount } from "@/lib/gestor";
import { addManagedAccount, setAccountAction, clearAccountAction } from "../actions";
import { brl } from "@/lib/format";
import { CostTrend } from "./trend";

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
    .select("id, act_id, client_name, monthly_budget, target_cpa, notes, active, next_action, next_action_at")
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

        {/* semáforo */}
        {health.length === 0 ? (
          <div className="card mt-4 border-dashed p-8 text-center text-sm text-faint">
            Nenhuma conta cadastrada ainda — adiciona a primeira logo abaixo e o semáforo nasce aqui.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {health.map((h) => {
              const meta = LEVEL_META[h.level];
              const y = h.yesterday;
              const d7 = h.d7;
              const cpaY = y.results > 0 ? y.spend / y.results : null;
              const cpa7 = d7.results > 0 ? d7.spend / d7.results : null;
              const cpaPrev7 = h.prev7.results > 0 ? h.prev7.spend / h.prev7.results : null;
              return (
                <div key={h.account.id} className="card p-4" style={{ borderColor: `color-mix(in srgb, ${meta.color} 45%, var(--color-line))` }}>
                  {/* linha 1: quem + estado + tendência — o clique abre o detalhe */}
                  <Link href={`/painel/contas/${h.account.id}`} className="flex flex-wrap items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
                    <span className="font-semibold text-snow">{h.account.client_name}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
                    >
                      {meta.label}
                    </span>
                    <CostTrend cur={cpa7} prev={cpaPrev7} />
                    <span className="ml-auto text-faint">→</span>
                  </Link>

                  {/* só o motivo PRINCIPAL + ontem — detalhe completo fica na página da conta */}
                  <p className="mt-1.5 text-sm" style={{ color: h.level === "green" ? "var(--color-mist)" : meta.color }}>
                    {h.reasons[0]}
                  </p>
                  {h.ok && (
                    <p className="num mt-1 text-xs text-mist">
                      ontem <strong className="text-snow">{brl.format(y.spend)}</strong>
                      {y.results > 0 && (
                        <>
                          {" "}· {y.results} {y.resultLabel}
                          {cpaY != null && <> · {brl.format(cpaY)}/res</>}
                        </>
                      )}
                    </p>
                  )}

                  {/* próxima ação: mini-tarefa da conta, sempre à vista */}
                  <div className="mt-2.5 border-t border-line/60 pt-2">
                    {h.account.next_action ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-signal-soft px-2.5 py-1 text-xs font-semibold text-signal">
                          → {h.account.next_action}
                        </span>
                        <form action={clearAccountAction}>
                          <input type="hidden" name="id" value={h.account.id} />
                          <button type="submit" className="btn btn-ghost btn-sm">✓ feito</button>
                        </form>
                      </div>
                    ) : (
                      <form action={setAccountAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="id" value={h.account.id} />
                        <input
                          name="action"
                          placeholder="+ próxima ação (ex.: trocar criativo qua)"
                          className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-2.5 py-1.5 text-xs placeholder:text-faint focus:border-signal/60 focus:outline-none"
                        />
                        <button type="submit" className="btn btn-ghost btn-sm shrink-0">salvar</button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* cadastrar conta — no rodapé de propósito: a tela abre direto no semáforo */}
        <section className="card mt-6 p-5">
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
            Sem custo-alvo, o semáforo compara com a média da própria conta (30d).
          </p>
        </section>
      </div>
    </main>
  );
}

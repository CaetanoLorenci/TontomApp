import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";
import { PanelNav } from "@/components/panel-nav";
import { CopyShare } from "@/components/copy-share";
import {
  accountHealth,
  campaignBreakdown,
  buildWhatsAppReport,
  type ManagedAccount,
} from "@/lib/gestor";

export const dynamic = "force-dynamic";

/* Relatório pronto por conta — já no formato do WhatsApp (negrito/emoji).
   Copiar (PC) ou Compartilhar (celular → abre a folha nativa → WhatsApp → contato).
   Economiza a hora de montar métricas: 7d vs semana anterior + 30d + campanhas + leitura. */

export default async function Relatorio() {
  const { seesAll } = await getScope();
  if (!seesAll) notFound();

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("managed_accounts")
    .select("id, act_id, client_name, monthly_budget, target_cpa, notes, active, next_action, next_action_at")
    .eq("active", true)
    .order("client_name", { ascending: true });
  const accounts = (data ?? []) as ManagedAccount[];

  const reports = await Promise.all(
    accounts.map(async (a) => {
      const [h, camps] = await Promise.all([accountHealth(a), campaignBreakdown(a.act_id)]);
      return { account: a, ok: h.ok, text: buildWhatsAppReport(h, camps) };
    }),
  );

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />
      <PanelNav active="relatorio" seesAll={seesAll} />

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        <h1 className="font-head text-2xl font-extrabold tracking-tight">Relatório</h1>
        <p className="mt-1 text-sm text-mist">
          Texto pronto no formato do WhatsApp — no celular, “Compartilhar” abre direto a conversa.
        </p>

        {reports.length === 0 ? (
          <div className="card mt-4 border-dashed p-8 text-center text-sm text-faint">
            Nenhuma conta cadastrada — adiciona em Contas e o relatório nasce aqui.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {reports.map((r) => (
              <section key={r.account.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">{r.account.client_name}</h2>
                  {r.ok && <CopyShare text={r.text} />}
                </div>
                {r.ok ? (
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-line/60 bg-pane2/60 p-3.5 font-sans text-sm leading-relaxed text-mist">
                    {r.text}
                  </pre>
                ) : (
                  <p className="mt-3 text-sm text-st-perd">
                    Sem acesso à conta agora (token) — tenta recarregar; se persistir, me chama.
                  </p>
                )}
              </section>
            ))}
          </div>
        )}

        <p className="mt-5 text-[11px] text-faint">
          Dica: revisa a “Leitura” antes de enviar — o texto é um rascunho inteligente, você é o gestor.
        </p>
      </div>
    </main>
  );
}

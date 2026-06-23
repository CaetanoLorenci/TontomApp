import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";
import { PanelNav } from "@/components/panel-nav";
import { updateProjeto, deleteProjeto } from "../actions";
import { STATUS_META } from "../page";

export const dynamic = "force-dynamic";

type Projeto = {
  id: string; org_id: string; nome: string; status: string; tipo: string | null;
  prioridade: string | null; prazo: string | null; descricao: string | null; report: string | null;
};

export default async function ProjetoWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, seesAll } = await getScope();
  const sb = supabaseAdmin();
  const { data } = await sb.from("projetos")
    .select("id, org_id, nome, status, tipo, prioridade, prazo, descricao, report").eq("id", id).maybeSingle();
  const p = data as Projeto | null;
  if (!p) notFound();
  if (!seesAll && p.org_id !== org) notFound();
  const st = STATUS_META[p.status] ?? STATUS_META.andamento;

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />
      <PanelNav active="projetos" seesAll={seesAll} />

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-8">
        <Link href="/painel/projetos" className="text-xs text-mist hover:text-signal">← Projetos</Link>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="font-head text-2xl font-extrabold tracking-tight">{p.nome}</h1>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
        </div>

        {seesAll ? (
          <>
            <section className="card mt-5 p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Detalhes & report</h2>
              <form action={updateProjeto} className="mt-3 space-y-3">
                <input type="hidden" name="id" value={p.id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <input name="nome" defaultValue={p.nome} placeholder="Nome"
                    className="rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none" />
                  <select name="status" defaultValue={p.status} style={{ colorScheme: "dark" }}
                    className="rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none">
                    {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <select name="tipo" defaultValue={p.tipo ?? ""} style={{ colorScheme: "dark" }}
                    className="rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none">
                    <option value="">Tipo…</option>
                    {["Campanha", "Conteúdo", "Setup"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select name="prioridade" defaultValue={p.prioridade ?? ""} style={{ colorScheme: "dark" }}
                    className="rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none">
                    <option value="">Prioridade…</option>
                    {[["alta", "Alta"], ["media", "Média"], ["baixa", "Baixa"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <input name="prazo" type="date" defaultValue={p.prazo ?? ""} style={{ colorScheme: "dark" }}
                    className="rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none sm:col-span-2" />
                </div>
                <textarea name="descricao" defaultValue={p.descricao ?? ""} placeholder="Descrição"
                  className="min-h-20 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none" />
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-faint">Report de desenvolvimento</label>
                  <textarea name="report" defaultValue={p.report ?? ""} placeholder="Atualizações, marcos, bloqueios, próximos passos…"
                    className="mt-1 min-h-36 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none" />
                </div>
                <button type="submit" className="rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]">Salvar</button>
              </form>
            </section>
            <form action={deleteProjeto} className="mt-3">
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" className="text-[11px] text-faint underline hover:text-st-perd">Excluir projeto</button>
            </form>
          </>
        ) : (
          <>
            {p.descricao && <section className="card mt-5 p-5"><h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Descrição</h2><p className="mt-2 whitespace-pre-wrap text-sm text-snow">{p.descricao}</p></section>}
            <section className="card mt-4 p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Report de desenvolvimento</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-snow">{p.report || "Sem report ainda."}</p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

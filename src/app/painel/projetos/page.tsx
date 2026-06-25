import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";
import { PanelNav } from "@/components/panel-nav";
import { createProjeto } from "./actions";

export const dynamic = "force-dynamic";

/* Projetos — trabalho contratado por cliente, com report de desenvolvimento.
   Equipe cria/edita; cliente acompanha status e report. */

export const STATUS_META: Record<string, { label: string; cls: string }> = {
  a_fazer: { label: "A fazer", cls: "text-mist border-line2" },
  andamento: { label: "Em andamento", cls: "text-st-agen border-st-agen/40" },
  revisao: { label: "Em revisão", cls: "text-st-qual border-st-qual/40" },
  entregue: { label: "Entregue", cls: "text-st-vend border-st-vend/40" },
};

type Projeto = { id: string; org_id: string; nome: string; status: string; tipo: string | null; prazo: string | null };

export default async function Projetos() {
  const { org, seesAll } = await getScope();
  const sb = supabaseAdmin();

  let q = sb.from("projetos").select("id, org_id, nome, status, tipo, prazo").order("created_at", { ascending: false });
  if (!seesAll) q = q.eq("org_id", org);
  const { data } = await q;
  const projetos = (data ?? []) as Projeto[];

  const orgNames = new Map<string, string>();
  let clientOrgs: { slug: string; name: string }[] = [];
  if (seesAll) {
    const { data: orgs } = await sb.from("organizations").select("slug, name").order("name");
    for (const o of orgs ?? []) orgNames.set((o as { slug: string }).slug, (o as { name: string }).name);
    clientOrgs = ((orgs ?? []) as { slug: string; name: string }[]).filter((o) => o.slug !== "amplia");
  }

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />
      <PanelNav active="projetos" seesAll={seesAll} />

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-8">
        <h1 className="font-head text-2xl font-extrabold tracking-tight">Projetos</h1>
        <p className="mt-1 text-sm text-mist">
          {seesAll ? "Trabalhos contratados por cliente, com report de desenvolvimento." : "Acompanhe o andamento dos seus projetos."}
        </p>

        {seesAll && (
          <section className="card mt-5 p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Novo projeto</h2>
            <form action={createProjeto} className="mt-3 flex flex-wrap items-end gap-2">
              <input name="nome" required placeholder="Nome do projeto"
                className="flex-1 rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none" />
              <select name="org_id" required defaultValue="" style={{ colorScheme: "dark" }}
                className="rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none">
                <option value="" disabled>Cliente…</option>
                {clientOrgs.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
              </select>
              <input name="prazo" type="date" style={{ colorScheme: "dark" }}
                className="rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none" />
              <button type="submit" className="btn btn-primary">Criar</button>
            </form>
          </section>
        )}

        <section className="mt-6 space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Projetos ({projetos.length})</h2>
          {projetos.length === 0 ? (
            <div className="card border-dashed p-8 text-center text-sm text-faint">Nenhum projeto ainda.</div>
          ) : (
            projetos.map((p) => {
              const st = STATUS_META[p.status] ?? STATUS_META.andamento;
              return (
                <Link key={p.id} href={`/painel/projetos/${p.id}`} className="card block p-4 transition-colors hover:border-signal/40">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{p.nome}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                    {p.tipo && <span className="text-[11px] text-faint">{p.tipo}</span>}
                    {seesAll && p.org_id !== "amplia" && <span className="ml-auto text-[11px] text-mist">{orgNames.get(p.org_id) ?? p.org_id}</span>}
                  </div>
                  {p.prazo && <div className="num mt-0.5 text-xs text-faint">Prazo: {new Date(p.prazo + "T00:00:00").toLocaleDateString("pt-BR")}</div>}
                </Link>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}

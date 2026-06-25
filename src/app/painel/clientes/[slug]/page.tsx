import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";
import { PanelNav } from "@/components/panel-nav";
import { updateOrgProfile, addEntregavel, deleteEntregavel } from "./actions";

export const dynamic = "force-dynamic";

/* Perfil rico do cliente (só Amplia): dados, identidade visual, escopo, histórico
   e os entregáveis contratados. */

type Org = {
  slug: string; name: string; logo_url: string | null; brand_color: string | null;
  segmento: string | null; contato_principal: string | null; contato_email: string | null;
  site: string | null; escopo_midia: string | null; observacoes: string | null;
  historico: string | null; tipografia: string | null; tom_voz: string | null;
};
type Entregavel = { id: string; tipo: string; frequencia: string | null; volume: string | null; descricao: string | null };

const inputCls = "w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none";

export default async function ClienteProfile({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { seesAll } = await getScope();
  if (!seesAll) notFound();

  const sb = supabaseAdmin();
  const [{ data: orgData }, { data: entData }] = await Promise.all([
    sb.from("organizations").select("slug, name, logo_url, brand_color, segmento, contato_principal, contato_email, site, escopo_midia, observacoes, historico, tipografia, tom_voz").eq("slug", slug).maybeSingle(),
    sb.from("entregaveis").select("id, tipo, frequencia, volume, descricao").eq("org_id", slug).order("created_at"),
  ]);
  const org = orgData as Org | null;
  if (!org) notFound();
  const entregaveis = (entData ?? []) as Entregavel[];

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />
      <PanelNav active="clientes" seesAll={seesAll} />

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-8">
        <Link href="/painel/clientes" className="text-xs text-mist hover:text-signal">← Clientes</Link>
        <h1 className="mt-3 font-head text-2xl font-extrabold tracking-tight">{org.name}</h1>
        <p className="mt-1 text-sm text-mist">{org.segmento || "Sem segmento"} · <span className="num">{org.slug}</span></p>

        <section className="card mt-5 p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Perfil do cliente</h2>
          <form action={updateOrgProfile} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="slug" value={org.slug} />
            <label className="block"><span className="text-xs text-faint">Nome</span><input name="name" defaultValue={org.name} className={inputCls} /></label>
            <label className="block"><span className="text-xs text-faint">Segmento</span><input name="segmento" defaultValue={org.segmento ?? ""} className={inputCls} /></label>
            <label className="block"><span className="text-xs text-faint">Contato principal</span><input name="contato_principal" defaultValue={org.contato_principal ?? ""} className={inputCls} /></label>
            <label className="block"><span className="text-xs text-faint">E-mail de contato</span><input name="contato_email" defaultValue={org.contato_email ?? ""} className={inputCls} /></label>
            <label className="block"><span className="text-xs text-faint">Site</span><input name="site" defaultValue={org.site ?? ""} className={inputCls} /></label>
            <label className="block"><span className="text-xs text-faint">Logo (URL)</span><input name="logo_url" defaultValue={org.logo_url ?? ""} className={inputCls} /></label>
            <label className="block sm:col-span-2"><span className="text-xs text-faint">Escopo de mídia</span><textarea name="escopo_midia" defaultValue={org.escopo_midia ?? ""} className={inputCls} /></label>
            <label className="block"><span className="text-xs text-faint">Cor da marca (hex)</span><input name="brand_color" defaultValue={org.brand_color ?? ""} placeholder="#FC4900" className={inputCls} /></label>
            <label className="block"><span className="text-xs text-faint">Tipografia</span><input name="tipografia" defaultValue={org.tipografia ?? ""} className={inputCls} /></label>
            <label className="block sm:col-span-2"><span className="text-xs text-faint">Tom de voz</span><input name="tom_voz" defaultValue={org.tom_voz ?? ""} className={inputCls} /></label>
            <label className="block sm:col-span-2"><span className="text-xs text-faint">Observações</span><textarea name="observacoes" defaultValue={org.observacoes ?? ""} className={inputCls} /></label>
            <label className="block sm:col-span-2"><span className="text-xs text-faint">Histórico relevante</span><textarea name="historico" defaultValue={org.historico ?? ""} className={inputCls} /></label>
            <div className="sm:col-span-2"><button type="submit" className="btn btn-primary">Salvar perfil</button></div>
          </form>
        </section>

        <section className="card mt-4 p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Entregáveis contratados</h2>
          <div className="mt-3 space-y-2">
            {entregaveis.length === 0 && <p className="text-sm text-faint">Nenhum entregável cadastrado.</p>}
            {entregaveis.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded-xl border border-line bg-pane2 px-3 py-2">
                <span className="rounded-full bg-signal-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-signal">{e.tipo}</span>
                <span className="text-sm text-snow">{e.frequencia ?? "—"}{e.volume ? ` · ${e.volume}` : ""}</span>
                {e.descricao && <span className="text-xs text-faint">{e.descricao}</span>}
                <form action={deleteEntregavel} className="ml-auto">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="org_id" value={org.slug} />
                  <button type="submit" className="text-[11px] text-faint underline hover:text-st-perd">remover</button>
                </form>
              </div>
            ))}
          </div>
          <form action={addEntregavel} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
            <input type="hidden" name="org_id" value={org.slug} />
            <select name="tipo" required defaultValue="" style={{ colorScheme: "dark" }}
              className="rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none">
              <option value="" disabled>Tipo…</option>
              {["Gestão de Ads", "Copy", "Criativos", "Relatório", "Orgânico/Social", "Outros"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select name="frequencia" defaultValue="" style={{ colorScheme: "dark" }}
              className="rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none">
              <option value="">Frequência…</option>
              {["Diária", "Semanal", "Quinzenal", "Mensal", "Sob demanda"].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <input name="volume" placeholder="Volume (ex.: 4/mês)"
              className="rounded-xl border border-line bg-transparent px-3 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none" />
            <button type="submit" className="btn btn-ghost">+ Entregável</button>
          </form>
        </section>
      </div>
    </main>
  );
}

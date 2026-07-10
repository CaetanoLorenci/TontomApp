import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";
import { PanelNav } from "@/components/panel-nav";
import { createCriativo, deleteCriativo } from "./actions";
import { ReviewCreative } from "./review";

export const dynamic = "force-dynamic";

/* Criativos — equipe sobe a peça; o cliente aprova ou reprova (reprovar exige >= 25 palavras).
   Substitui o fluxo informal de "pedido de anúncio" da Central por uma aprovação formal.
   Duas visões: "Todos" (gestão/aprovação) e "Galeria" (acervo dos aprovados, por mês, filtro por tipo). */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "text-st-agen border-st-agen/40" },
  aprovado: { label: "Aprovado", cls: "text-st-vend border-st-vend/40" },
  reprovado: { label: "Reprovado", cls: "text-st-perd border-st-perd/40" },
};

const TIPOS = ["Foto", "Vídeo", "Arte", "Render 3D"];

type Criativo = {
  id: string;
  org_id: string;
  titulo: string;
  tipo: string | null;
  descricao: string | null;
  arquivo_url: string | null;
  status_aprovacao: string;
  motivo_reprovacao: string | null;
  created_at: string;
};

const mesLabel = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

export default async function Criativos({
  searchParams,
}: {
  searchParams: Promise<{ galeria?: string; tipo?: string }>;
}) {
  const sp = await searchParams;
  const galeria = sp.galeria === "1";
  const tipoFiltro = sp.tipo && TIPOS.includes(sp.tipo) ? sp.tipo : null;

  const { org, seesAll } = await getScope();
  const sb = supabaseAdmin();

  let q = sb
    .from("criativos")
    .select("id, org_id, titulo, tipo, descricao, arquivo_url, status_aprovacao, motivo_reprovacao, created_at")
    .order("created_at", { ascending: false });
  if (!seesAll) q = q.eq("org_id", org);
  const { data } = await q;
  const criativos = (data ?? []) as Criativo[];

  const orgNames = new Map<string, string>();
  let clientOrgs: { slug: string; name: string }[] = [];
  if (seesAll) {
    const { data: orgs } = await sb.from("organizations").select("slug, name").order("name");
    for (const o of orgs ?? []) orgNames.set((o as { slug: string }).slug, (o as { name: string }).name);
    clientOrgs = ((orgs ?? []) as { slug: string; name: string }[]).filter((o) => o.slug !== "amplia");
  }

  // Galeria: só aprovados, filtro por tipo, agrupados por mês (mantém a ordem desc)
  const aprovados = criativos
    .filter((c) => c.status_aprovacao === "aprovado")
    .filter((c) => !tipoFiltro || c.tipo === tipoFiltro);
  const gruposGaleria: { mes: string; itens: Criativo[] }[] = [];
  for (const c of aprovados) {
    const mes = mesLabel(c.created_at);
    const ultimo = gruposGaleria[gruposGaleria.length - 1];
    if (ultimo && ultimo.mes === mes) ultimo.itens.push(c);
    else gruposGaleria.push({ mes, itens: [c] });
  }

  const tabCls = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${on ? "bg-signal-soft text-signal" : "text-mist hover:text-snow"}`;

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />
      <PanelNav active="criativos" seesAll={seesAll} />

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-8">
        <h1 className="font-head text-2xl font-extrabold tracking-tight">Criativos</h1>
        <p className="mt-1 text-sm text-mist">
          {galeria
            ? "Acervo dos criativos já aprovados, organizados por mês."
            : seesAll
              ? "Suba a peça para o cliente aprovar. Reprovações exigem um motivo com pelo menos 25 palavras."
              : "Aprove ou reprove os criativos. Ao reprovar, explique o ajuste com pelo menos 25 palavras."}
        </p>

        {/* Alternador Todos / Galeria */}
        <div className="mt-4 inline-flex items-center gap-1 rounded-xl border border-line bg-pane p-1">
          <Link href="/painel/criativos" className={tabCls(!galeria)}>Todos</Link>
          <Link href="/painel/criativos?galeria=1" className={tabCls(galeria)}>Galeria</Link>
        </div>

        {galeria ? (
          <>
            {/* Filtro por tipo */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              <Link
                href="/painel/criativos?galeria=1"
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${!tipoFiltro ? "border-signal/50 text-signal" : "border-line text-mist hover:text-snow"}`}
              >
                Todos
              </Link>
              {TIPOS.map((t) => (
                <Link
                  key={t}
                  href={`/painel/criativos?galeria=1&tipo=${encodeURIComponent(t)}`}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${tipoFiltro === t ? "border-signal/50 text-signal" : "border-line text-mist hover:text-snow"}`}
                >
                  {t}
                </Link>
              ))}
            </div>

            {aprovados.length === 0 ? (
              <div className="card mt-4 border-dashed p-8 text-center text-sm text-faint">
                Nenhum criativo aprovado{tipoFiltro ? ` do tipo "${tipoFiltro}"` : ""} ainda.
              </div>
            ) : (
              gruposGaleria.map((grupo) => (
                <section key={grupo.mes} className="mt-6">
                  <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">
                    {grupo.mes} <span className="text-mist">· {grupo.itens.length}</span>
                  </h2>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {grupo.itens.map((c) => (
                      <div key={c.id} className="card overflow-hidden p-0">
                        <div className="flex aspect-video items-center justify-center bg-pane2">
                          {c.arquivo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.arquivo_url} alt={c.titulo} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs text-faint">sem imagem</span>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{c.titulo}</span>
                            <span className="rounded-full border border-st-vend/40 px-2 py-0.5 text-[10px] font-semibold text-st-vend">Aprovado</span>
                            {c.tipo && <span className="text-[11px] text-faint">{c.tipo}</span>}
                            {seesAll && c.org_id !== "amplia" && (
                              <span className="ml-auto text-[11px] text-mist">{orgNames.get(c.org_id) ?? c.org_id}</span>
                            )}
                          </div>
                          {c.descricao && <p className="mt-2 text-sm text-mist">{c.descricao}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </>
        ) : (
          <>
            {seesAll && (
              <section className="card mt-5 p-5">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Novo criativo</h2>
                <form action={createCriativo} className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input name="titulo" required placeholder="Título"
                    className="rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none" />
                  <select name="org_id" required defaultValue="" style={{ colorScheme: "dark" }}
                    className="rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none">
                    <option value="" disabled>Cliente…</option>
                    {clientOrgs.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
                  </select>
                  <select name="tipo" defaultValue="" style={{ colorScheme: "dark" }}
                    className="rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none">
                    <option value="">Tipo…</option>
                    {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input name="arquivo_url" placeholder="Link da imagem/arquivo (URL)"
                    className="rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none" />
                  <textarea name="descricao" placeholder="Descrição (opcional)"
                    className="rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none sm:col-span-2" />
                  <div className="sm:col-span-2">
                    <button type="submit" className="btn btn-primary">
                      Adicionar criativo
                    </button>
                  </div>
                </form>
              </section>
            )}

            <section className="mt-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">
                {seesAll ? `Criativos (${criativos.length})` : `Seus criativos (${criativos.length})`}
              </h2>

              {criativos.length === 0 ? (
                <div className="card mt-3 border-dashed p-8 text-center text-sm text-faint">
                  Nenhum criativo ainda{seesAll ? "." : " — assim que a Amplia subir, aparece aqui."}
                </div>
              ) : (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {criativos.map((c) => {
                    const st = STATUS_META[c.status_aprovacao] ?? STATUS_META.pendente;
                    return (
                      <div key={c.id} className="card overflow-hidden p-0">
                        <div className="flex aspect-video items-center justify-center bg-pane2">
                          {c.arquivo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.arquivo_url} alt={c.titulo} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs text-faint">sem imagem</span>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{c.titulo}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                            {c.tipo && <span className="text-[11px] text-faint">{c.tipo}</span>}
                            {seesAll && c.org_id !== "amplia" && (
                              <span className="ml-auto text-[11px] text-mist">{orgNames.get(c.org_id) ?? c.org_id}</span>
                            )}
                          </div>
                          {c.descricao && <p className="mt-2 text-sm text-mist">{c.descricao}</p>}
                          {c.status_aprovacao === "reprovado" && c.motivo_reprovacao && (
                            <p className="mt-2 rounded-lg border border-st-perd/30 bg-pane2 p-2 text-xs text-mist">
                              <span className="font-semibold text-st-perd">Motivo: </span>{c.motivo_reprovacao}
                            </p>
                          )}

                          {c.status_aprovacao !== "aprovado" && <ReviewCreative id={c.id} />}

                          {seesAll && (
                            <form action={deleteCriativo} className="mt-2">
                              <input type="hidden" name="id" value={c.id} />
                              <button type="submit" className="text-[11px] text-faint underline hover:text-st-perd">Excluir</button>
                            </form>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
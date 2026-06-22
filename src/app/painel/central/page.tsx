import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";
import { setRequestStatus } from "../actions";
import { formatWhen } from "@/lib/format";
import { PanelNav } from "@/components/panel-nav";
import { CentralComposer } from "./composer";

export const dynamic = "force-dynamic";

/* Central do Cliente — canal de pedidos/sugestões.
   Cliente: escreve + acompanha os dele. Amplia: caixa de pedidos de todos + muda status. */

const KIND_LABEL: Record<string, string> = { geral: "Geral", anuncio: "Pedido de anúncio", app: "Feedback do app" };
const STATUS_META: Record<string, { label: string; cls: string }> = {
  aberto: { label: "Aberto", cls: "text-st-novo border-st-novo/40" },
  andamento: { label: "Em andamento", cls: "text-st-agen border-st-agen/40" },
  feito: { label: "Concluído", cls: "text-st-vend border-st-vend/40" },
};

type Req = {
  id: string;
  org_id: string;
  kind: string;
  body: string;
  status: string;
  created_at: string;
};

export default async function Central() {
  const { org, seesAll } = await getScope();
  const sb = supabaseAdmin();

  let q = sb.from("client_requests").select("id, org_id, kind, body, status, created_at").order("created_at", { ascending: false });
  if (!seesAll) q = q.eq("org_id", org);
  const { data } = await q;
  const reqs = (data ?? []) as Req[];

  const orgNames = new Map<string, string>();
  if (seesAll) {
    const { data: orgs } = await sb.from("organizations").select("slug, name");
    for (const o of orgs ?? []) orgNames.set((o as { slug: string }).slug, (o as { name: string }).name);
  }

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />
      <PanelNav active="central" seesAll={seesAll} />

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-head text-2xl font-extrabold tracking-tight">
          {seesAll ? "Caixa de pedidos" : "Fale com a Amplia"}
        </h1>
        <p className="mt-1 text-sm text-mist">
          {seesAll
            ? "Pedidos e sugestões enviados pelos clientes. Mude o status pra avisar quem pediu."
            : "Peça anúncios, sugira melhorias ou mande observações. A Amplia recebe na hora."}
        </p>

        {/* composer (cliente cria; Amplia também pode registrar) */}
        {!seesAll && (
          <section className="card mt-5 p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Novo</h2>
            <div className="mt-3">
              <CentralComposer />
            </div>
          </section>
        )}

        {/* lista */}
        <section className="mt-6 space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">
            {seesAll ? `Pedidos (${reqs.length})` : `Seus pedidos (${reqs.length})`}
          </h2>

          {reqs.length === 0 && (
            <div className="card border-dashed p-8 text-center text-sm text-faint">
              Nenhum pedido ainda{seesAll ? "." : " — mande o primeiro acima."}
            </div>
          )}

          {reqs.map((r) => {
            const st = STATUS_META[r.status] ?? STATUS_META.aberto;
            return (
              <div key={r.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-signal-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-signal">
                    {KIND_LABEL[r.kind] ?? r.kind}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                  {seesAll && r.org_id !== "amplia" && (
                    <span className="text-[11px] font-medium text-mist">{orgNames.get(r.org_id) ?? r.org_id}</span>
                  )}
                  <span className="num ml-auto text-[10px] text-faint">{formatWhen(r.created_at)}</span>
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm text-snow">{r.body}</p>

                {seesAll && (
                  <form action={setRequestStatus} className="mt-3 flex items-center gap-1.5">
                    <input type="hidden" name="id" value={r.id} />
                    {(["aberto", "andamento", "feito"] as const).map((s) => (
                      <button
                        key={s}
                        type="submit"
                        name="status"
                        value={s}
                        disabled={r.status === s}
                        className={`rounded-lg border px-2.5 py-1 text-xs transition-colors disabled:opacity-100 ${
                          r.status === s
                            ? `${STATUS_META[s].cls} bg-pane2 font-semibold`
                            : "border-line text-mist hover:border-line2 hover:text-snow"
                        }`}
                      >
                        {STATUS_META[s].label}
                      </button>
                    ))}
                  </form>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}

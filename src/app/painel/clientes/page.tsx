import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";
import { createOrg, inviteToOrg, addAdRoute, removeAdRoute, setOrgNumber } from "../actions";
import { PanelNav } from "@/components/panel-nav";

export const dynamic = "force-dynamic";

/* Clientes (só Amplia): cria org de cliente, define o modo, convida acesso.
   Cada cliente loga e vê só os dados da org dele. */

const MODE_LABEL: Record<string, string> = {
  rastreio: "Rastreio",
  site: "Conversão (site)",
  completo: "Completo (CTWA)",
};

type Org = { slug: string; name: string; mode: string; wa_phone_number_id: string | null };
type Member = { org_slug: string; user_id: string };
type Route = { id: string; match_type: string; match_value: string; org_slug: string };

export default async function Clientes() {
  const { seesAll } = await getScope();
  if (!seesAll) notFound(); // cliente não acessa a gestão de clientes

  const sb = supabaseAdmin();
  const [{ data: orgs }, { data: members }, { data: leadRows }, { data: routeRows }] = await Promise.all([
    sb.from("organizations").select("slug, name, mode, wa_phone_number_id").order("created_at", { ascending: true }),
    sb.from("org_members").select("org_slug, user_id"),
    sb.from("leads").select("org_id"),
    sb.from("ad_routes").select("id, match_type, match_value, org_slug"),
  ]);

  const memberCount = new Map<string, number>();
  for (const m of (members ?? []) as Member[]) memberCount.set(m.org_slug, (memberCount.get(m.org_slug) ?? 0) + 1);
  const leadCount = new Map<string, number>();
  for (const l of (leadRows ?? []) as { org_id: string }[]) leadCount.set(l.org_id, (leadCount.get(l.org_id) ?? 0) + 1);
  const routesByOrg = new Map<string, Route[]>();
  for (const r of (routeRows ?? []) as Route[]) {
    const list = routesByOrg.get(r.org_slug) ?? [];
    list.push(r);
    routesByOrg.set(r.org_slug, list);
  }

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />

      <PanelNav active="clientes" seesAll={seesAll} />

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-8">
        {/* criar cliente */}
        <section className="card p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Novo cliente</h2>
          <form action={createOrg} className="mt-3 flex flex-wrap items-end gap-2">
            <input
              name="name"
              required
              placeholder="Nome do cliente"
              className="flex-1 rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
            />
            <select
              name="mode"
              defaultValue="rastreio"
              style={{ colorScheme: "dark" }}
              className="rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none"
            >
              <option value="rastreio">Rastreio</option>
              <option value="site">Conversão (site)</option>
              <option value="completo">Completo (CTWA)</option>
            </select>
            <button type="submit" className="btn btn-primary">
              Criar
            </button>
          </form>
        </section>

        {/* lista de clientes */}
        <section className="mt-6 space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Clientes ({(orgs ?? []).length})</h2>
          {(orgs ?? []).map((o) => {
            const org = o as Org;
            const isAmplia = org.slug === "amplia";
            return (
              <div key={org.slug} className={`card p-4 ${isAmplia ? "!border-signal/30" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/painel/clientes/${org.slug}`} className="font-semibold hover:text-signal">{org.name}</Link>
                      <span className="rounded-full bg-signal-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-signal">
                        {MODE_LABEL[org.mode] ?? org.mode}
                      </span>
                      {isAmplia && <span className="text-[10px] text-faint">(interno)</span>}
                      <Link href={`/painel/clientes/${org.slug}`} className="text-[10px] text-faint underline hover:text-signal">perfil</Link>
                    </div>
                    <div className="num mt-0.5 text-xs text-faint">
                      {leadCount.get(org.slug) ?? 0} leads · {memberCount.get(org.slug) ?? 0} acesso(s) · <span className="text-mist">{org.slug}</span>
                    </div>
                  </div>

                  {!isAmplia && (
                    <form action={inviteToOrg} className="flex items-center gap-1.5">
                      <input type="hidden" name="orgSlug" value={org.slug} />
                      <input
                        type="email"
                        name="email"
                        required
                        placeholder="e-mail do cliente"
                        className="rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
                      />
                      <button type="submit" className="btn btn-ghost">
                        Convidar
                      </button>
                    </form>
                  )}
                </div>

                {!isAmplia && (
                  <div className="mt-3 border-t border-line pt-3">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-faint">
                      Contas de anúncio (roteamento automático)
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {(routesByOrg.get(org.slug) ?? []).map((r) => (
                        <span key={r.id} className="num inline-flex items-center gap-1.5 rounded-full bg-signal-soft px-2.5 py-1 text-[11px] text-signal">
                          act_{r.match_value}
                          <form action={removeAdRoute}>
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="text-signal/60 hover:text-signal" title="Remover" aria-label="Remover">×</button>
                          </form>
                        </span>
                      ))}
                      <form action={addAdRoute} className="flex items-center gap-1.5">
                        <input type="hidden" name="orgSlug" value={org.slug} />
                        <input
                          name="account"
                          required
                          placeholder="act_123… ou ID da conta"
                          className="num w-44 rounded-xl border border-line bg-transparent px-3 py-1.5 text-xs placeholder:text-faint focus:border-signal/60 focus:outline-none"
                        />
                        <button type="submit" className="btn btn-ghost btn-sm">Mapear</button>
                      </form>
                    </div>
                    <p className="mt-1.5 text-[11px] text-faint">
                      Leads vindos de anúncios dessa conta caem direto neste cliente. (O token de Ads da Amplia precisa ter acesso à conta.)
                    </p>

                    <div className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-faint">
                      Número de WhatsApp próprio (Completo / CTWA)
                    </div>
                    <form action={setOrgNumber} className="mt-2 flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="orgSlug" value={org.slug} />
                      <input
                        name="phoneId"
                        defaultValue={org.wa_phone_number_id ?? ""}
                        placeholder="phone_number_id da Cloud API"
                        className="num w-56 rounded-xl border border-line bg-transparent px-3 py-1.5 text-xs placeholder:text-faint focus:border-signal/60 focus:outline-none"
                      />
                      <button type="submit" className="btn btn-ghost btn-sm">Salvar número</button>
                      {org.wa_phone_number_id && (
                        <span className="text-[11px] text-emerald-400">● número próprio ativo</span>
                      )}
                    </form>
                    <p className="mt-1.5 text-[11px] text-faint">
                      Com número próprio: leads que chegam nele caem aqui e as respostas saem desse número (a marca do cliente, não a da Amplia). Vazio = usa o número da Amplia.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <p className="mt-6 text-xs text-faint">
          Pra dar acesso ao cliente sem depender de e-mail, use <Link href="/painel/acesso" className="text-signal underline">Acesso</Link> (define e-mail + senha e vincula ao cliente). O cliente vê só os dados da org dele. Roteamento de leads: <strong>automático</strong> ao mapear a conta de anúncio acima; pra casos avulsos, abra a conversa do lead e use “Atribuir a cliente”.
        </p>
      </div>
    </main>
  );
}

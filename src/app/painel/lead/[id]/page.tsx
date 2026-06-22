import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import {
  brl,
  formatPhone,
  formatWhen,
  formatSchedule,
  isoToBrLocalInput,
  STAGE_META,
  NEXT_ACTIONS,
} from "@/lib/format";
import { updateLead, scheduleLead, addNote, addTag, removeTag, setLeadOrg } from "../../actions";
import { ScheduleButton } from "../../schedule-button";
import {
  IconMetaOk,
  IconAdvance,
  IconSale,
  IconPhone,
  IconCalendar,
  IconClock,
  LogoMark,
} from "@/components/icons";
import { AdSourceCard } from "@/components/ad-source-card";
import { getAdCreative } from "@/lib/meta-ads";
import { getScope } from "@/lib/auth";
import { Chat } from "./chat";

export const dynamic = "force-dynamic";

/* ════════════════════════════════════════════════════════════
   Conversa do lead — o chat inteiro dentro do Tontom.
   Bolhas in/out, origem do anúncio, eventos CAPI e ações.
   ════════════════════════════════════════════════════════════ */

type Msg = { id: string; direction: "in" | "out"; content: string | null; created_at: string; status?: string | null };

export default async function LeadConversa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { org, seesAll } = await getScope();

  // 3 queries em paralelo (usando o id direto) — sem esperar o lead pra buscar o resto
  const [{ data: lead }, { data: msgs }, { data: events }, { data: notesData }] = await Promise.all([
    sb
      .from("leads")
      .select(
        "id, phone, name, stage, value, code, attributed_via, created_at, scheduled_at, scheduled_note, tags, org_id, clicks(utm_source, utm_campaign, utm_content, ad_id, ctwa_clid, fbclid)",
      )
      .eq("id", id)
      .maybeSingle(),
    sb
      .from("messages")
      .select("id, direction, content, created_at, status")
      .eq("lead_id", id)
      .order("created_at", { ascending: true }),
    sb.from("capi_events").select("event_name, created_at, response").eq("lead_id", id),
    sb
      .from("lead_notes")
      .select("id, body, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!lead) notFound();
  // cliente não pode abrir lead de outra org (Amplia vê tudo)
  if (!seesAll && (lead as { org_id?: string }).org_id !== org) notFound();
  const tags = ((lead.tags as string[] | null) ?? []) as string[];
  const notes = (notesData ?? []) as { id: string; body: string; created_at: string }[];
  const leadOrg = (lead as { org_id?: string }).org_id ?? "amplia";
  const orgs = seesAll
    ? (((await sb.from("organizations").select("slug, name").order("name")).data ?? []) as {
        slug: string;
        name: string;
      }[])
    : [];

  const messages = (msgs ?? []) as Msg[];
  const click = lead.clicks as unknown as {
    utm_source: string | null;
    utm_campaign: string | null;
    utm_content: string | null;
    ad_id: string | null;
    ctwa_clid: string | null;
    fbclid: string | null;
  } | null;
  const meta = STAGE_META[lead.stage] ?? STAGE_META.novo;
  const creative = await getAdCreative(sb, click?.ad_id ?? null);

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />

      {/* topo */}
      <header className="sticky top-0 z-20 border-b border-line bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/painel"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-mist transition-colors hover:border-line2 hover:text-snow"
              aria-label="voltar"
            >
              <IconAdvance size={15} className="rotate-180" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
                <h1 className="font-bold">{lead.name ?? "Sem nome"}</h1>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
                >
                  {meta.label}
                </span>
                {lead.stage === "vendido" && lead.value != null && (
                  <span className="num text-xs font-bold text-signal">{brl.format(lead.value)}</span>
                )}
              </div>
              <div className="num mt-0.5 flex items-center gap-1.5 text-xs text-mist">
                <IconPhone size={11} />
                {formatPhone(lead.phone)} · desde {formatWhen(lead.created_at)}
              </div>
            </div>
          </div>
          <LogoMark size={24} className="opacity-60" />
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-6">
        {/* origem + capi */}
        <section className="card anim-up flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0 flex-1">
            <AdSourceCard
              creative={creative}
              fallbackCampaign={click?.utm_campaign}
              adId={click?.ad_id}
              code={lead.code}
              attributedVia={lead.attributed_via}
            />
          </div>
          {(events ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(events ?? []).map((e, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 rounded-full bg-signal-soft px-2 py-0.5 text-[11px] font-semibold text-signal"
                  title={formatWhen(e.created_at)}
                >
                  <IconMetaOk size={11} />
                  Meta · {e.event_name}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* agendamento (mini-CRM) */}
        {(lead.stage === "agendado" || lead.scheduled_at) && (
          <section className="card anim-up mt-4 p-4" style={{ animationDelay: "60ms" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <IconCalendar size={16} className="text-st-agen" />
                {lead.scheduled_at ? (
                  <span className="font-medium">
                    Agendado <span className="num text-st-agen">{formatSchedule(lead.scheduled_at)}</span>
                  </span>
                ) : (
                  <span className="text-faint">Agendado — sem data definida</span>
                )}
              </div>
              <form action={scheduleLead} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="leadId" value={lead.id} />
                <input
                  type="datetime-local"
                  name="scheduledAt"
                  required
                  defaultValue={lead.scheduled_at ? isoToBrLocalInput(lead.scheduled_at) : undefined}
                  className="num rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm focus:border-signal/60 focus:outline-none"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl border border-line2 bg-pane2 px-3 py-1.5 text-sm font-medium text-snow transition-colors hover:border-signal/50 hover:text-signal"
                >
                  <IconClock size={14} /> {lead.scheduled_at ? "Reagendar" : "Definir"}
                </button>
              </form>
            </div>
            {lead.scheduled_note && <p className="mt-2 text-xs text-mist">📝 {lead.scheduled_note}</p>}
          </section>
        )}

        {/* ficha do contato: cliente (só Amplia) + tags + notas internas */}
        <section className="card anim-up mt-4 p-4" style={{ animationDelay: "90ms" }}>
          {seesAll && (
            <form action={setLeadOrg} className="mb-3 flex flex-wrap items-center gap-2 border-b border-line/60 pb-3">
              <input type="hidden" name="leadId" value={lead.id} />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">Cliente</span>
              <select
                name="orgSlug"
                defaultValue={leadOrg}
                style={{ colorScheme: "dark" }}
                className="rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm focus:border-signal/60 focus:outline-none"
              >
                {orgs.map((o) => (
                  <option key={o.slug} value={o.slug}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-xl border border-line2 bg-pane2 px-3 py-1.5 text-sm font-medium text-snow transition-colors hover:border-signal/50 hover:text-signal"
              >
                Atribuir
              </button>
            </form>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">Tags</span>
            {tags.map((t) => (
              <form key={t} action={removeTag} className="inline">
                <input type="hidden" name="leadId" value={lead.id} />
                <input type="hidden" name="tag" value={t} />
                <button
                  type="submit"
                  title="remover tag"
                  className="group inline-flex items-center gap-1 rounded-full bg-signal-soft px-2.5 py-0.5 text-[11px] font-medium text-signal transition-colors hover:bg-st-perd/15 hover:text-st-perd"
                >
                  {t}
                  <span className="opacity-50 group-hover:opacity-100">×</span>
                </button>
              </form>
            ))}
            <form action={addTag} className="inline-flex">
              <input type="hidden" name="leadId" value={lead.id} />
              <input
                name="tag"
                placeholder="+ tag"
                className="num w-20 rounded-full border border-line bg-transparent px-2.5 py-0.5 text-[11px] placeholder:text-faint focus:border-signal/60 focus:outline-none"
              />
            </form>
          </div>

          <form action={addNote} className="mt-3 flex gap-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <input
              name="body"
              placeholder="Adicionar nota interna…"
              className="flex-1 rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-xl border border-line2 bg-pane2 px-3 py-1.5 text-sm font-medium text-snow transition-colors hover:border-signal/50 hover:text-signal"
            >
              Salvar
            </button>
          </form>

          {notes.length > 0 && (
            <ul className="mt-3 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-xl border border-line/60 bg-ink/40 px-3 py-2">
                  <p className="whitespace-pre-wrap text-sm text-mist">{n.body}</p>
                  <span className="num mt-1 block text-[10px] text-faint">{formatWhen(n.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* chat + resposta otimista (client) */}
        <div className="anim-up mt-4" style={{ animationDelay: "120ms" }}>
          <Chat leadId={lead.id} messages={messages} />
        </div>

        {/* ações de estágio */}
        {NEXT_ACTIONS[lead.stage]?.length > 0 && (
          <section className="card anim-up sticky bottom-4 mt-4 p-4" style={{ animationDelay: "200ms" }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-widest text-faint">Mover pra</span>
              <form action={updateLead} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="leadId" value={lead.id} />
                {NEXT_ACTIONS[lead.stage]
                  .filter((s) => s !== "agendado")
                  .map((s) => (
                    <button
                      key={s}
                      type="submit"
                      name="stage"
                      value={s}
                      className={
                        s === "vendido"
                          ? "flex items-center gap-1.5 rounded-xl bg-signal px-3.5 py-1.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]"
                          : s === "perdido"
                            ? "rounded-xl border border-line px-3.5 py-1.5 text-sm text-faint transition-colors hover:border-st-perd/50 hover:text-st-perd"
                            : "flex items-center gap-1.5 rounded-xl border border-line2 bg-pane2 px-3.5 py-1.5 text-sm font-medium text-snow transition-colors hover:border-signal/50 hover:text-signal"
                      }
                    >
                      {s === "vendido" ? (
                        <>
                          <IconSale size={14} /> Vendido
                        </>
                      ) : s === "perdido" ? (
                        "Perdido"
                      ) : (
                        <>
                          <IconAdvance size={14} /> {STAGE_META[s].label}
                        </>
                      )}
                    </button>
                  ))}
                {NEXT_ACTIONS[lead.stage].includes("vendido") && (
                  <input
                    name="value"
                    inputMode="decimal"
                    placeholder="valor R$"
                    className="num w-32 rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
                  />
                )}
              </form>
              {NEXT_ACTIONS[lead.stage].includes("agendado") && (
                <ScheduleButton
                  leadId={lead.id}
                  defaultValue={lead.scheduled_at ? isoToBrLocalInput(lead.scheduled_at) : null}
                />
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

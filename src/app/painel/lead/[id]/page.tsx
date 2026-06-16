import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { stripInvisible } from "@/lib/code";
import { brl, formatPhone, formatWhen, formatDay, STAGE_META, NEXT_ACTIONS } from "@/lib/format";
import { updateLead, replyToLead } from "../../actions";
import { IconBroadcast, IconMetaOk, IconWarn, IconAdvance, IconSale, IconPhone, IconChat, LogoMark } from "@/components/icons";

export const dynamic = "force-dynamic";

/* ════════════════════════════════════════════════════════════
   Conversa do lead — o chat inteiro dentro do Tontom.
   Bolhas in/out, origem do anúncio, eventos CAPI e ações.
   ════════════════════════════════════════════════════════════ */

type Msg = { id: string; direction: "in" | "out"; content: string | null; created_at: string };

export default async function LeadConversa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: lead } = await sb
    .from("leads")
    .select(
      "id, phone, name, stage, value, code, attributed_via, created_at, clicks(utm_source, utm_campaign, utm_content, ad_id, ctwa_clid, fbclid)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!lead) notFound();

  const [{ data: msgs }, { data: events }] = await Promise.all([
    sb
      .from("messages")
      .select("id, direction, content, created_at")
      .or(`lead_id.eq.${lead.id},phone.eq.${lead.phone}`)
      .order("created_at", { ascending: true }),
    sb.from("capi_events").select("event_name, created_at, response").eq("lead_id", lead.id),
  ]);

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

  // agrupa mensagens por dia (separador no chat)
  const byDay: { day: string; items: Msg[] }[] = [];
  for (const m of messages) {
    const day = formatDay(m.created_at);
    const last = byDay[byDay.length - 1];
    if (last && last.day === day) last.items.push(m);
    else byDay.push({ day, items: [m] });
  }

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
        <section className="card anim-up flex flex-wrap items-center justify-between gap-3 p-4">
          {click ? (
            <div className="flex items-center gap-2 text-sm">
              <IconBroadcast size={15} className="text-signal" />
              <span className="font-medium">{click.utm_campaign ?? "(sem campanha)"}</span>
              <span className="num text-xs text-faint">
                {[click.utm_source, click.ad_id && `ad ${click.ad_id}`, lead.code].filter(Boolean).join(" · ")}
              </span>
              {lead.attributed_via === "ctwa" && <span className="text-xs font-semibold text-signal">nativo</span>}
              {lead.attributed_via === "janela" && <span className="text-xs text-st-agen">≈ janela</span>}
            </div>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-st-agen">
              <IconWarn size={14} /> sem origem rastreada
            </span>
          )}
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

        {/* chat */}
        <section className="anim-up mt-4" style={{ animationDelay: "120ms" }}>
          {messages.length === 0 ? (
            <div className="card border-dashed p-10 text-center text-faint">
              <p>Nenhuma mensagem registrada ainda.</p>
              <p className="mt-1 text-xs">As mensagens chegam aqui em tempo real via Z-API.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {byDay.map((g) => (
                <div key={g.day}>
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-line" />
                    <span className="text-[10px] font-medium uppercase tracking-widest text-faint">{g.day}</span>
                    <div className="h-px flex-1 bg-line" />
                  </div>
                  <div className="space-y-2">
                    {g.items.map((m) => (
                      <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                            m.direction === "out"
                              ? "rounded-br-md bg-signal-soft text-snow"
                              : "rounded-bl-md border border-line bg-pane text-snow"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {m.content ? stripInvisible(m.content) : <span className="italic text-faint">(mídia/sem texto)</span>}
                          </p>
                          <p className={`num mt-1 text-[10px] ${m.direction === "out" ? "text-signal/70" : "text-faint"}`}>
                            {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            {m.direction === "out" ? " · Amplia" : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* responder pelo WhatsApp oficial (Cloud API) */}
        <section className="anim-up mt-4" style={{ animationDelay: "160ms" }}>
          <form action={replyToLead} className="flex items-center gap-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <input
              name="text"
              autoComplete="off"
              placeholder="Responder pelo WhatsApp…"
              className="flex-1 rounded-2xl border border-line bg-pane px-4 py-3 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-2xl bg-signal px-4 py-3 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]"
            >
              <IconChat size={16} />
              Enviar
            </button>
          </form>
          <p className="mt-1.5 px-1 text-[10px] text-faint">
            Envia pelo WhatsApp oficial. Funciona na janela de 24h após a última mensagem do lead.
          </p>
        </section>

        {/* ações de estágio */}
        {NEXT_ACTIONS[lead.stage]?.length > 0 && (
          <section className="card anim-up sticky bottom-4 mt-4 p-4" style={{ animationDelay: "200ms" }}>
            <form action={updateLead} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-widest text-faint">Mover pra</span>
              {NEXT_ACTIONS[lead.stage].map((s) => (
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
              <input
                name="value"
                inputMode="decimal"
                placeholder="valor R$"
                className="num w-32 rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
              />
            </form>
          </section>
        )}
      </div>
    </main>
  );
}

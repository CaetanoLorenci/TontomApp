import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { updateLead } from "./actions";
import {
  LogoMark,
  IconChat,
  IconTarget,
  IconTrend,
  IconSale,
  IconCash,
  IconBroadcast,
  IconFunnel,
  IconDownload,
  IconWarn,
  IconMetaOk,
  IconAdvance,
  IconCalendar,
} from "@/components/icons";
import { formatSchedule, isoToBrLocalInput } from "@/lib/format";
import { ScheduleButton } from "./schedule-button";
import { getAdCreatives } from "@/lib/meta-ads";
import { getScope } from "@/lib/auth";
import { PanelNav } from "@/components/panel-nav";

export const dynamic = "force-dynamic";

/* ════════════════════════════════════════════════════════════
   Painel Amplia Hub — sonar de conversas.
   Estrutura espelha o TinTim (métricas do período, origens,
   funil, conversas) com identidade própria + status CAPI.
   ════════════════════════════════════════════════════════════ */

type LeadRow = {
  id: string;
  phone: string;
  name: string | null;
  first_message: string | null;
  stage: string;
  value: number | null;
  code: string | null;
  attributed_via: string | null;
  created_at: string;
  scheduled_at: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_dir: string | null;
  clicks: {
    utm_source: string | null;
    utm_campaign: string | null;
    utm_content: string | null;
    ad_id: string | null;
    fbclid: string | null;
  } | null;
};

const STAGE: Record<string, { label: string; color: string }> = {
  novo: { label: "Novo", color: "var(--color-st-novo)" },
  qualificado: { label: "Qualificado", color: "var(--color-st-qual)" },
  agendado: { label: "Agendado", color: "var(--color-st-agen)" },
  vendido: { label: "Vendido", color: "var(--color-st-vend)" },
  perdido: { label: "Perdido", color: "var(--color-st-perd)" },
};

const NEXT_ACTIONS: Record<string, string[]> = {
  novo: ["qualificado", "agendado", "perdido"],
  qualificado: ["agendado", "vendido", "perdido"],
  agendado: ["vendido", "perdido"],
  vendido: [],
  perdido: ["novo"],
};

const PERIODS: Record<string, { label: string; days: number | null }> = {
  hoje: { label: "Hoje", days: 0 },
  "7d": { label: "7d", days: 7 },
  "30d": { label: "30d", days: 30 },
  tudo: { label: "Tudo", days: null },
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatPhone(p: string): string {
  const m = p.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : p;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return sameDay
    ? `hoje ${hm}`
    : `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} ${hm}`;
}

function periodStart(days: number | null): Date | null {
  if (days === null) return null;
  const d = new Date();
  if (days === 0) d.setHours(0, 0, 0, 0);
  else d.setDate(d.getDate() - days);
  return d;
}

/* ── série temporal pro gráfico de atividade ── */
function buildSeries(leads: LeadRow[], days: number | null): { label: string; count: number }[] {
  if (days === 0) {
    // hoje: por hora
    const buckets = Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, count: 0 }));
    for (const l of leads) buckets[new Date(l.created_at).getHours()].count++;
    return buckets;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let n = days ?? 30;
  if (days === null && leads.length > 0) {
    const first = new Date(leads[leads.length - 1].created_at);
    n = Math.min(60, Math.max(7, Math.ceil((today.getTime() - first.getTime()) / 86400000) + 1));
  }
  const buckets: { key: string; label: string; count: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({
      key: d.toDateString(),
      label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      count: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const l of leads) {
    const k = new Date(l.created_at);
    k.setHours(0, 0, 0, 0);
    const b = byKey.get(k.toDateString());
    if (b) b.count++;
  }
  return buckets;
}

/* gráfico de área SVG, gerado no servidor — sem lib */
function ActivityChart({ series }: { series: { label: string; count: number }[] }) {
  const W = 640;
  const H = 140;
  const PAD = 8;
  const max = Math.max(1, ...series.map((s) => s.count));
  const stepX = (W - PAD * 2) / Math.max(1, series.length - 1);
  const y = (c: number) => H - PAD - (c / max) * (H - PAD * 2 - 14);
  const pts = series.map((s, i) => [PAD + i * stepX, y(s.count)] as const);
  const line = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = `${line} L${(PAD + (series.length - 1) * stepX).toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-signal)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-signal)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* linhas-guia */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={PAD}
          x2={W - PAD}
          y1={H * f}
          y2={H * f}
          stroke="var(--color-line)"
          strokeDasharray="3 6"
          strokeWidth="1"
        />
      ))}
      <path d={area} fill="url(#areaFill)" className="anim-area" />
      <path
        d={line}
        fill="none"
        stroke="var(--color-signal)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        className="anim-draw"
        style={{ ["--dash" as string]: 1600 }}
      />
      {last && (
        <circle cx={last[0]} cy={last[1]} r="3.5" fill="var(--color-signal)" className="live-dot" />
      )}
    </svg>
  );
}

export default async function Painel({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; q?: string; stage?: string }>;
}) {
  const { p, q, stage } = await searchParams;
  const period = PERIODS[p ?? "30d"] ? (p ?? "30d") : "30d";
  const since = periodStart(PERIODS[period].days);
  const query = (q ?? "").trim();
  const stageFilter = ["novo", "qualificado", "agendado", "vendido", "perdido"].includes(stage ?? "")
    ? (stage as string)
    : null;

  const sb = supabaseAdmin();
  const { org, seesAll } = await getScope();
  let leadsQuery = sb
    .from("leads")
    .select(
      "id, phone, name, first_message, stage, value, code, attributed_via, created_at, scheduled_at, last_message, last_message_at, last_message_dir, clicks(utm_source, utm_campaign, utm_content, ad_id, fbclid)",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (since) leadsQuery = leadsQuery.gte("created_at", since.toISOString());
  if (!seesAll) leadsQuery = leadsQuery.eq("org_id", org);

  let eventsQuery = sb.from("capi_events").select("lead_id, event_name");
  if (!seesAll) eventsQuery = eventsQuery.eq("org_id", org);

  const [{ data, error }, { data: events }] = await Promise.all([leadsQuery, eventsQuery]);

  const leads = (data ?? []) as unknown as LeadRow[];

  // busca (nome/telefone) + filtro de estágio — só na LISTA (métricas seguem o período inteiro)
  const qLower = query.toLowerCase();
  const displayLeads = leads.filter((l) => {
    if (stageFilter && l.stage !== stageFilter) return false;
    if (qLower) {
      const hay = `${l.name ?? ""} ${l.phone}`.toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });
  const filtering = !!query || !!stageFilter;

  const creativeMap = await getAdCreatives(sb, leads.map((l) => l.clicks?.ad_id));
  const capiByLead = new Map<string, string[]>();
  for (const e of events ?? []) {
    const list = capiByLead.get(e.lead_id) ?? [];
    list.push(e.event_name);
    capiByLead.set(e.lead_id, list);
  }

  /* métricas do período */
  const total = leads.length;
  const rastreadas = leads.filter((l) => l.clicks).length;
  const pctRastreadas = total ? Math.round((rastreadas / total) * 100) : 0;
  const vendas = leads.filter((l) => l.stage === "vendido");
  const txConversao = total ? Math.round((vendas.length / total) * 100) : 0;
  const faturamento = vendas.reduce((s, l) => s + (l.value ?? 0), 0);

  /* origens */
  type OrigemAgg = { conversas: number; qualificadas: number; vendas: number; receita: number };
  const origens = new Map<string, OrigemAgg>();
  for (const l of leads) {
    const key = l.clicks ? (l.clicks.utm_campaign ?? "(campanha sem nome)") : "__sem__";
    const agg = origens.get(key) ?? { conversas: 0, qualificadas: 0, vendas: 0, receita: 0 };
    agg.conversas++;
    if (["qualificado", "agendado", "vendido"].includes(l.stage)) agg.qualificadas++;
    if (l.stage === "vendido") {
      agg.vendas++;
      agg.receita += l.value ?? 0;
    }
    origens.set(key, agg);
  }
  const origensSorted = [...origens.entries()].sort(
    (a, b) => b[1].receita - a[1].receita || b[1].conversas - a[1].conversas,
  );
  const maxConversas = Math.max(1, ...origensSorted.map(([, o]) => o.conversas));

  /* funil */
  const funil = [
    { key: "novo", count: total },
    { key: "qualificado", count: leads.filter((l) => ["qualificado", "agendado", "vendido"].includes(l.stage)).length },
    { key: "agendado", count: leads.filter((l) => ["agendado", "vendido"].includes(l.stage)).length },
    { key: "vendido", count: vendas.length },
  ];
  const funilMax = Math.max(1, total);
  const series = buildSeries(leads, PERIODS[period].days);

  const stats = [
    { label: "Conversas", value: String(total), icon: IconChat },
    { label: "Rastreadas", value: `${pctRastreadas}%`, hint: `${rastreadas} de ${total}`, icon: IconTarget },
    { label: "Vendas", value: String(vendas.length), icon: IconSale },
    { label: "Conversão", value: `${txConversao}%`, hint: "conversa → venda", icon: IconTrend },
    { label: "Faturamento", value: brl.format(faturamento), icon: IconCash, accent: true },
  ];

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />

      {/* ── topo ── */}
      <PanelNav
        active="painel"
        seesAll={seesAll}
        right={
          <>
            <nav className="flex shrink-0 rounded-xl border border-line bg-pane p-1 text-sm">
              {Object.entries(PERIODS).map(([k, v]) => (
                <Link
                  key={k}
                  href={`/painel?p=${k}`}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${
                    k === period ? "bg-signal-soft font-semibold text-signal" : "text-mist hover:text-snow"
                  }`}
                >
                  {v.label}
                </Link>
              ))}
            </nav>
            <a
              href={`/painel/export?p=${period}`}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-pane px-3 py-2 text-sm text-mist transition-colors hover:border-line2 hover:text-snow"
            >
              <IconDownload size={15} />
              CSV
            </a>
          </>
        }
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-8">
        {/* ── métricas ── */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`card anim-up p-4 ${s.accent ? "!border-signal/30" : ""}`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">
                  {s.label}
                </span>
                <s.icon size={16} className={s.accent ? "text-signal" : "text-faint"} />
              </div>
              <div className={`num mt-2 truncate text-2xl font-bold ${s.accent ? "text-signal" : ""}`}>
                {s.value}
              </div>
              {s.hint && <div className="mt-0.5 text-xs text-faint">{s.hint}</div>}
            </div>
          ))}
        </section>

        {/* ── atividade ── */}
        <section className="card anim-up mt-4 p-5" style={{ animationDelay: "360ms" }}>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-faint">
              <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-signal" />
              Atividade — conversas por {PERIODS[period].days === 0 ? "hora" : "dia"}
            </h2>
            <span className="num text-xs text-faint">
              pico {Math.max(0, ...series.map((s) => s.count))}
            </span>
          </div>
          <div className="mt-3">
            <ActivityChart series={series} />
          </div>
          <div className="num mt-1 flex justify-between text-[10px] text-faint">
            <span>{series[0]?.label}</span>
            <span>{series[Math.floor(series.length / 2)]?.label}</span>
            <span>{series[series.length - 1]?.label}</span>
          </div>
        </section>

        {/* ── origens + funil ── */}
        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="card anim-up p-5 lg:col-span-2" style={{ animationDelay: "430ms" }}>
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-faint">
              <IconBroadcast size={14} />
              Principais origens
            </h2>
            {origensSorted.length === 0 ? (
              <p className="mt-4 text-sm text-faint">Sem conversas no período.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {origensSorted.map(([nome, o], i) => (
                  <div key={nome}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className={nome === "__sem__" ? "flex items-center gap-1.5 text-st-agen" : "font-medium"}>
                        {nome === "__sem__" ? (
                          <>
                            <IconWarn size={14} /> Sem rastreio
                          </>
                        ) : (
                          nome
                        )}
                      </span>
                      <span className="num flex shrink-0 gap-4 text-xs text-mist">
                        <span>{o.conversas} conv</span>
                        <span>{o.qualificadas} qual</span>
                        <span>{o.vendas} vendas</span>
                        <span className={o.receita ? "font-semibold text-signal" : "text-faint"}>
                          {o.receita ? brl.format(o.receita) : "—"}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/60">
                      <div
                        className="anim-grow h-full rounded-full"
                        style={{
                          width: `${Math.round((o.conversas / maxConversas) * 100)}%`,
                          background:
                            nome === "__sem__"
                              ? "var(--color-st-agen)"
                              : "linear-gradient(90deg, var(--color-signal), var(--color-st-qual))",
                          animationDelay: `${500 + i * 90}ms`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card anim-up p-5" style={{ animationDelay: "500ms" }}>
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-faint">
              <IconFunnel size={14} />
              Funil
            </h2>
            <div className="mt-4 space-y-4">
              {funil.map((f, i) => {
                const meta = STAGE[f.key];
                const pct = Math.round((f.count / funilMax) * 100);
                return (
                  <div key={f.key}>
                    <div className="flex justify-between text-xs">
                      <span className="text-mist">{meta.label}</span>
                      <span className="num font-semibold">
                        {f.count}
                        <span className="ml-1.5 text-faint">{pct}%</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line/60">
                      <div
                        className="anim-grow h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: meta.color,
                          animationDelay: `${560 + i * 110}ms`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── conversas ── */}
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-faint">
              <IconChat size={14} />
              Conversas
              {filtering && (
                <span className="text-faint normal-case tracking-normal">
                  · {displayLeads.length} de {leads.length}
                </span>
              )}
            </h2>

            {/* busca + filtro de estágio (GET, preserva o período) */}
            <form method="get" action="/painel" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="p" value={period} />
              <input
                name="q"
                defaultValue={query}
                placeholder="Buscar nome ou telefone…"
                className="w-48 rounded-xl border border-line bg-pane px-3 py-1.5 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
              />
              <select
                name="stage"
                defaultValue={stageFilter ?? ""}
                style={{ colorScheme: "dark" }}
                className="rounded-xl border border-line bg-pane px-2 py-1.5 text-sm focus:border-signal/60 focus:outline-none"
              >
                <option value="">Todos os estágios</option>
                <option value="novo">Novo</option>
                <option value="qualificado">Qualificado</option>
                <option value="agendado">Agendado</option>
                <option value="vendido">Vendido</option>
                <option value="perdido">Perdido</option>
              </select>
              <button
                type="submit"
                className="btn btn-ghost"
              >
                Filtrar
              </button>
              {filtering && (
                <a href={`/painel?p=${period}`} className="text-xs text-faint underline transition-colors hover:text-snow">
                  limpar
                </a>
              )}
            </form>
          </div>

          {error && (
            <p className="mt-3 rounded-xl border border-st-perd/40 bg-st-perd/10 p-3 text-sm text-st-perd">
              Erro lendo o banco: {error.message}
            </p>
          )}

          {leads.length === 0 ? (
            <div className="card mt-3 border-dashed p-12 text-center">
              <LogoMark size={36} className="mx-auto opacity-50" />
              <p className="mt-3 font-medium text-mist">Nenhuma conversa no período.</p>
              <p className="mt-1 text-sm text-faint">
                Abra <code className="rounded bg-pane2 px-1.5 py-0.5 text-signal">/r?utm_campaign=teste</code> pra
                simular um clique de anúncio.
              </p>
            </div>
          ) : displayLeads.length === 0 ? (
            <div className="card mt-3 border-dashed p-8 text-center text-sm text-faint">
              Nenhuma conversa pra essa busca/filtro. <a href={`/painel?p=${period}`} className="text-signal underline">limpar</a>
            </div>
          ) : (
            <ul className="mt-3 space-y-3">
              {displayLeads.map((l, i) => {
                const meta = STAGE[l.stage] ?? STAGE.novo;
                const capi = capiByLead.get(l.id) ?? [];
                const cr = l.clicks?.ad_id ? (creativeMap.get(l.clicks.ad_id) ?? null) : null;
                const needsReply = l.last_message_dir === "in";
                const initials = (l.name ?? "?")
                  .trim()
                  .split(/\s+/)
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase() || "?";
                return (
                  <li
                    key={l.id}
                    className={`card anim-up p-4 transition-colors ${needsReply ? "!border-signal/40" : ""}`}
                    style={{ animationDelay: `${620 + Math.min(i, 8) * 60}ms` }}
                  >
                    {/* área de info = um único alvo de toque (abre a conversa) */}
                    <Link href={`/painel/lead/${l.id}`} className="flex items-start gap-3">
                      {/* avatar + indicador "aguardando resposta" */}
                      <div className="relative shrink-0">
                        <div
                          className="num flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold"
                          style={{ borderColor: meta.color, color: meta.color, background: `color-mix(in srgb, ${meta.color} 10%, transparent)` }}
                        >
                          {initials}
                        </div>
                        {needsReply && (
                          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-signal ring-2 ring-ink" title="aguardando sua resposta" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* linha 1: nome forte + estado */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold text-snow">{l.name ?? "Sem nome"}</span>
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
                          >
                            {meta.label}
                          </span>
                          {needsReply && (
                            <span className="shrink-0 rounded-full bg-signal-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-signal">
                              responder
                            </span>
                          )}
                          {l.stage === "vendido" && l.value != null && (
                            <span className="num shrink-0 text-xs font-bold text-signal">{brl.format(l.value)}</span>
                          )}
                        </div>

                        {/* linha 2: prévia da última mensagem */}
                        {(l.last_message ?? l.first_message) && (
                          <p className="mt-1 line-clamp-1 text-sm text-mist">
                            {l.last_message && (
                              <span className={`mr-1 font-semibold ${needsReply ? "text-st-agen" : "text-faint"}`}>
                                {needsReply ? "Lead:" : "Você:"}
                              </span>
                            )}
                            {l.last_message ?? l.first_message}
                          </p>
                        )}

                        {/* linha 3: metadados (telefone/hora · agenda · origem · Meta) */}
                        <div className="num mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
                          <span>
                            {formatPhone(l.phone)} · {formatWhen(l.last_message_at ?? l.created_at)}
                          </span>
                          {l.stage === "agendado" && l.scheduled_at && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-st-agen/10 px-2 py-0.5 font-medium text-st-agen">
                              <IconCalendar size={11} /> {formatSchedule(l.scheduled_at)}
                            </span>
                          )}
                          {l.clicks ? (
                            <span className="inline-flex items-center gap-1 text-mist">
                              {cr?.image_path ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={cr.image_path} alt="" className="h-4 w-4 rounded border border-line object-cover" />
                              ) : (
                                <IconBroadcast size={12} className="text-signal" />
                              )}
                              <span className="max-w-[11rem] truncate">
                                {cr?.campaign_name ?? l.clicks.utm_campaign ?? "(sem campanha)"}
                              </span>
                              {l.attributed_via === "ctwa" && <span className="font-semibold text-signal">· nativo</span>}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-st-agen">
                              <IconWarn size={12} /> sem rastreio
                            </span>
                          )}
                          {capi.length > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-signal-soft px-2 py-0.5 font-semibold text-signal" title={`Meta · ${[...new Set(capi)].join(", ")}`}>
                              <IconMetaOk size={12} /> Meta
                            </span>
                          )}
                        </div>
                      </div>

                      <IconAdvance size={16} className="mt-1 shrink-0 text-faint" />
                    </Link>

                    {NEXT_ACTIONS[l.stage]?.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <form action={updateLead} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="leadId" value={l.id} />
                          {NEXT_ACTIONS[l.stage]
                            .filter((s) => s !== "agendado")
                            .map((s) => (
                              <button
                                key={s}
                                type="submit"
                                name="stage"
                                value={s}
                                className={
                                  s === "vendido" ? "btn btn-primary" : s === "perdido" ? "btn btn-danger" : "btn btn-ghost"
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
                                    <IconAdvance size={14} /> {STAGE[s].label}
                                  </>
                                )}
                              </button>
                            ))}
                          {NEXT_ACTIONS[l.stage].includes("vendido") && (
                            <input
                              name="value"
                              inputMode="decimal"
                              placeholder="valor R$"
                              className="num w-32 rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
                            />
                          )}
                        </form>
                        {NEXT_ACTIONS[l.stage].includes("agendado") && (
                          <ScheduleButton
                            leadId={l.id}
                            defaultValue={l.scheduled_at ? isoToBrLocalInput(l.scheduled_at) : null}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="mt-10 flex items-center justify-between border-t border-line pt-4 text-xs text-faint">
          <span>
            Amplia <span className="text-signal">Hub</span> — CRM de tráfego pago · Grupo Amplia
          </span>
          <span className="num">anúncio → conversa → venda → Meta</span>
        </footer>
      </div>
    </main>
  );
}

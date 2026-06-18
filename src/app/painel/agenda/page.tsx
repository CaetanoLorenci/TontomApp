import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { updateLead, scheduleLead } from "../actions";
import {
  formatPhone,
  formatTimeBR,
  formatDayLongBR,
  isoToBrLocalInput,
  brDayKey,
} from "@/lib/format";
import { monthGrid, googleCalUrl } from "@/lib/calendar";
import {
  LogoMark,
  IconCalendar,
  IconClock,
  IconPhone,
  IconChat,
  IconAdvance,
  IconSale,
  IconBroadcast,
  IconWarn,
  IconFunnel,
  IconTrend,
} from "@/components/icons";

export const dynamic = "force-dynamic";

/* ════════════════════════════════════════════════════════════
   Agenda — compromissos dos leads, em DUAS visões (alternador):
   • Lista: agrupada por dia (Atrasados/Hoje/Amanhã/próximos)
   • Mês: grade estilo Google Agenda
   Tudo em horário de Brasília. Cada item vai pro Google Agenda.
   ════════════════════════════════════════════════════════════ */

type Lead = {
  id: string;
  phone: string;
  name: string | null;
  stage: string;
  scheduled_at: string;
  scheduled_note: string | null;
  clicks: { utm_campaign: string | null } | null;
};

type Section = { key: string; label: string; order: number; danger?: boolean; today?: boolean; items: Lead[] };

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function googleLink(l: Lead): string {
  return googleCalUrl({
    title: `${l.name ?? "Lead"} — Amplia`,
    startIso: l.scheduled_at,
    details: `WhatsApp: ${l.phone}${l.clicks?.utm_campaign ? ` · ${l.clicks.utm_campaign}` : ""}`,
  });
}

export default async function Agenda({ searchParams }: { searchParams: Promise<{ view?: string; m?: string }> }) {
  const { view, m } = await searchParams;
  const isMes = view === "mes";
  const sb = supabaseAdmin();
  const todayKey = brDayKey(new Date());

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />

      <header className="sticky top-0 z-20 border-b border-line bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/painel" className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="font-head text-lg font-extrabold tracking-tight">
              tontom<span className="text-signal">.</span>
            </span>
          </Link>
          <nav className="flex rounded-xl border border-line bg-pane p-1 text-sm">
            <Link href="/painel" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-mist transition-colors hover:text-snow">
              <IconChat size={14} /> Painel
            </Link>
            <Link href="/painel/pipeline" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-mist transition-colors hover:text-snow">
              <IconFunnel size={14} /> Pipeline
            </Link>
            <span className="flex items-center gap-1.5 rounded-lg bg-signal-soft px-3 py-1.5 font-semibold text-signal">
              <IconCalendar size={14} /> Agenda
            </span>
          </nav>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-6">
        {/* alternador de visão */}
        <div className="mb-5 flex items-center gap-1 rounded-xl border border-line bg-pane p-1 text-sm" style={{ width: "fit-content" }}>
          <Link
            href="/painel/agenda"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
              !isMes ? "bg-signal-soft font-semibold text-signal" : "text-mist hover:text-snow"
            }`}
          >
            <IconTrend size={14} /> Lista
          </Link>
          <Link
            href="/painel/agenda?view=mes"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
              isMes ? "bg-signal-soft font-semibold text-signal" : "text-mist hover:text-snow"
            }`}
          >
            <IconCalendar size={14} /> Mês
          </Link>
        </div>

        {isMes ? await MesView({ sb, m, todayKey }) : await ListaView({ sb, todayKey })}
      </div>
    </main>
  );
}

/* ── Visão MÊS (grade) ── */
async function MesView({
  sb,
  m,
  todayKey,
}: {
  sb: ReturnType<typeof supabaseAdmin>;
  m?: string;
  todayKey: string;
}) {
  const anchor = m && /^\d{4}-\d{2}$/.test(m) ? m : todayKey.slice(0, 7);
  const [year, month1] = anchor.split("-").map(Number);
  const grid = monthGrid(year, month1);

  const startIso = new Date(`${grid.days[0].key}T00:00:00-03:00`).toISOString();
  const endIso = new Date(`${grid.days[41].key}T23:59:59-03:00`).toISOString();
  const { data } = await sb
    .from("leads")
    .select("id, phone, name, stage, scheduled_at, scheduled_note, clicks(utm_campaign)")
    .eq("stage", "agendado")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", startIso)
    .lte("scheduled_at", endIso)
    .order("scheduled_at", { ascending: true });

  const appts = (data ?? []) as unknown as Lead[];
  const byDay = new Map<string, Lead[]>();
  for (const a of appts) {
    const k = brDayKey(new Date(a.scheduled_at));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(a);
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold capitalize">{grid.label}</h1>
        <div className="flex gap-1.5">
          <Link href={`/painel/agenda?view=mes&m=${grid.prev}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-mist transition-colors hover:border-line2 hover:text-snow" aria-label="mês anterior">
            <IconAdvance size={15} className="rotate-180" />
          </Link>
          <Link href="/painel/agenda?view=mes" className="rounded-lg border border-line px-3 py-1.5 text-xs text-mist transition-colors hover:border-line2 hover:text-snow">
            Hoje
          </Link>
          <Link href={`/painel/agenda?view=mes&m=${grid.next}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-mist transition-colors hover:border-line2 hover:text-snow" aria-label="próximo mês">
            <IconAdvance size={15} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-widest text-faint">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>

      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {grid.days.map((d) => {
          const items = byDay.get(d.key) ?? [];
          const isToday = d.key === todayKey;
          return (
            <div
              key={d.key}
              className={`min-h-24 rounded-lg border p-1.5 ${
                d.inMonth ? "border-line bg-pane/40" : "border-line/40"
              } ${isToday ? "!border-signal/60" : ""}`}
            >
              <div className={`num mb-1 text-xs ${isToday ? "font-bold text-signal" : d.inMonth ? "text-mist" : "text-faint"}`}>
                {d.day}
              </div>
              <div className="flex flex-col gap-1">
                {items.map((a) => (
                  <div key={a.id} className="flex items-center gap-1 rounded-md bg-st-agen/15 px-1.5 py-1 text-[11px] text-st-agen" title={a.name ?? "Sem nome"}>
                    <Link href={`/painel/lead/${a.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      <span className="num font-semibold">{formatTimeBR(a.scheduled_at)}</span> {a.name ?? "Sem nome"}
                    </Link>
                    <a href={googleLink(a)} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded px-1 font-bold opacity-50 transition-opacity hover:opacity-100" title="Adicionar ao Google Agenda">
                      G
                    </a>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-faint">
        Clique no nome pra abrir o lead · no <span className="font-bold text-st-agen">G</span> pra adicionar ao Google Agenda · horários em Brasília.
      </p>
    </>
  );
}

/* ── Visão LISTA (agrupada por dia) ── */
async function ListaView({
  sb,
  todayKey,
}: {
  sb: ReturnType<typeof supabaseAdmin>;
  todayKey: string;
}) {
  const { data } = await sb
    .from("leads")
    .select("id, phone, name, stage, scheduled_at, scheduled_note, clicks(utm_campaign)")
    .eq("stage", "agendado")
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: true });

  const leads = (data ?? []) as unknown as Lead[];
  const tomorrowKey = brDayKey(new Date(Date.now() + 86_400_000));

  let overdueCount = 0;
  let todayCount = 0;
  const secMap = new Map<string, Section>();
  for (const l of leads) {
    const dayKey = brDayKey(new Date(l.scheduled_at));
    let sec: Omit<Section, "items">;
    if (dayKey < todayKey) {
      sec = { key: "atrasado", label: "Atrasados", order: 0, danger: true };
      overdueCount++;
    } else if (dayKey === todayKey) {
      sec = { key: "hoje", label: "Hoje", order: 1, today: true };
      todayCount++;
    } else if (dayKey === tomorrowKey) {
      sec = { key: "amanha", label: "Amanhã", order: 2 };
    } else {
      sec = { key: dayKey, label: formatDayLongBR(l.scheduled_at), order: 3 };
    }
    if (!secMap.has(sec.key)) secMap.set(sec.key, { ...sec, items: [] });
    secMap.get(sec.key)!.items.push(l);
  }
  const sections = [...secMap.values()].sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1));

  return (
    <>
      <section className="grid max-w-4xl grid-cols-3 gap-3">
        {[
          { label: "Agendados", value: leads.length, accent: false, danger: false },
          { label: "Hoje", value: todayCount, accent: true, danger: false },
          { label: "Atrasados", value: overdueCount, accent: false, danger: overdueCount > 0 },
        ].map((s) => (
          <div key={s.label} className={`card p-4 ${s.danger ? "!border-st-perd/40" : s.accent ? "!border-signal/30" : ""}`}>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">{s.label}</span>
            <div className={`num mt-1 text-2xl font-bold ${s.danger ? "text-st-perd" : s.accent ? "text-signal" : ""}`}>
              {s.value}
            </div>
          </div>
        ))}
      </section>

      {leads.length === 0 ? (
        <div className="card mt-6 max-w-4xl border-dashed p-12 text-center">
          <IconCalendar size={36} className="mx-auto opacity-50" />
          <p className="mt-3 font-medium text-mist">Nenhum compromisso agendado.</p>
          <p className="mt-1 text-sm text-faint">
            Mova um lead pra <span className="text-st-agen">Agendado</span> com data/hora pra ele aparecer aqui.
          </p>
        </div>
      ) : (
        <div className="mt-6 max-w-4xl space-y-8">
          {sections.map((sec) => (
            <section key={sec.key}>
              <h2 className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest ${sec.danger ? "text-st-perd" : sec.today ? "text-signal" : "text-faint"}`}>
                {sec.danger ? <IconWarn size={14} /> : <IconCalendar size={14} />}
                {sec.label}
                <span className="num font-normal opacity-60">· {sec.items.length}</span>
              </h2>

              <ul className="mt-3 space-y-2.5">
                {sec.items.map((l) => (
                  <li key={l.id} className={`card p-4 ${sec.danger ? "!border-st-perd/25" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`num flex shrink-0 flex-col items-center rounded-xl border px-3 py-1.5 ${sec.danger ? "border-st-perd/40 text-st-perd" : "border-st-agen/40 text-st-agen"}`}>
                          <IconClock size={14} />
                          <span className="mt-0.5 text-sm font-bold">{formatTimeBR(l.scheduled_at)}</span>
                        </div>
                        <div>
                          <Link href={`/painel/lead/${l.id}`} className="font-semibold transition-colors hover:text-signal">
                            {l.name ?? "Sem nome"}
                          </Link>
                          <div className="num mt-0.5 flex items-center gap-1.5 text-xs text-mist">
                            <IconPhone size={11} />
                            {formatPhone(l.phone)}
                            {l.clicks?.utm_campaign && (
                              <>
                                <IconBroadcast size={11} className="ml-1 text-signal" />
                                <span className="text-faint">{l.clicks.utm_campaign}</span>
                              </>
                            )}
                          </div>
                          {l.scheduled_note && <p className="mt-1.5 text-xs text-mist">📝 {l.scheduled_note}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <a href={googleLink(l)} target="_blank" rel="noopener noreferrer" className="font-medium text-mist transition-colors hover:text-signal" title="Adicionar ao Google Agenda">
                          + Google
                        </a>
                        <Link href={`/painel/lead/${l.id}`} className="flex items-center gap-1.5 font-medium text-mist transition-colors hover:text-signal">
                          <IconChat size={13} /> Abrir
                          <IconAdvance size={12} />
                        </Link>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
                      <form action={updateLead} className="flex items-center gap-2">
                        <input type="hidden" name="leadId" value={l.id} />
                        <button type="submit" name="stage" value="vendido" className="flex items-center gap-1.5 rounded-xl bg-signal px-3 py-1.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]">
                          <IconSale size={14} /> Vendido
                        </button>
                        <input name="value" inputMode="decimal" placeholder="valor R$" className="num w-24 rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none" />
                        <button type="submit" name="stage" value="perdido" className="rounded-xl border border-line px-3 py-1.5 text-sm text-faint transition-colors hover:border-st-perd/50 hover:text-st-perd">
                          Não fechou
                        </button>
                      </form>

                      <form action={scheduleLead} className="flex items-center gap-1.5">
                        <input type="hidden" name="leadId" value={l.id} />
                        <input type="datetime-local" name="scheduledAt" required defaultValue={isoToBrLocalInput(l.scheduled_at)} className="num rounded-xl border border-line bg-transparent px-2.5 py-1.5 text-xs focus:border-signal/60 focus:outline-none" />
                        <button type="submit" className="flex items-center gap-1 rounded-xl border border-line2 bg-pane2 px-2.5 py-1.5 text-xs font-medium text-snow transition-colors hover:border-signal/50 hover:text-signal" title="reagendar">
                          <IconClock size={13} /> Reagendar
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { updateLead, scheduleLead } from "../actions";
import {
  formatPhone,
  formatTimeBR,
  formatSchedule,
  formatDayLongBR,
  isoToBrLocalInput,
  brDayKey,
} from "@/lib/format";
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
} from "@/components/icons";

export const dynamic = "force-dynamic";

/* ════════════════════════════════════════════════════════════
   Agenda — mini-CRM dos compromissos.
   Lê os leads em "agendado" com data/hora, agrupa por dia
   (Atrasados / Hoje / Amanhã / próximos) em horário de Brasília.
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

export default async function Agenda() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("leads")
    .select("id, phone, name, stage, scheduled_at, scheduled_note, clicks(utm_campaign)")
    .eq("stage", "agendado")
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: true });

  const leads = (data ?? []) as unknown as Lead[];

  const now = new Date();
  const todayKey = brDayKey(now);
  const tomorrowKey = brDayKey(new Date(now.getTime() + 86_400_000));

  let overdueCount = 0;
  let todayCount = 0;
  const secMap = new Map<string, Section>();
  for (const l of leads) {
    const when = new Date(l.scheduled_at);
    const dayKey = brDayKey(when);
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
    const existing = secMap.get(sec.key) ?? { ...sec, items: [] };
    existing.items.push(l);
    secMap.set(sec.key, existing);
  }
  const sections = [...secMap.values()].sort(
    (a, b) => a.order - b.order || (a.key < b.key ? -1 : 1),
  );

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />

      {/* topo */}
      <header className="sticky top-0 z-20 border-b border-line bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/painel" className="flex items-center gap-2.5">
            <span className="relative flex h-8 w-8 items-center justify-center">
              <LogoMark size={26} />
            </span>
            <span className="font-head text-lg font-extrabold tracking-tight">
              tontom<span className="text-signal">.</span>
            </span>
          </Link>
          <nav className="flex rounded-xl border border-line bg-pane p-1 text-sm">
            <Link href="/painel" className="rounded-lg px-3 py-1.5 text-mist transition-colors hover:text-snow">
              Painel
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

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-8">
        {/* resumo */}
        <section className="grid grid-cols-3 gap-3">
          {[
            { label: "Agendados", value: leads.length, accent: false, danger: false },
            { label: "Hoje", value: todayCount, accent: true, danger: false },
            { label: "Atrasados", value: overdueCount, accent: false, danger: overdueCount > 0 },
          ].map((s) => (
            <div key={s.label} className={`card p-4 ${s.danger ? "!border-st-perd/40" : s.accent ? "!border-signal/30" : ""}`}>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">{s.label}</span>
              <div
                className={`num mt-1 text-2xl font-bold ${
                  s.danger ? "text-st-perd" : s.accent ? "text-signal" : ""
                }`}
              >
                {s.value}
              </div>
            </div>
          ))}
        </section>

        {leads.length === 0 ? (
          <div className="card mt-6 border-dashed p-12 text-center">
            <IconCalendar size={36} className="mx-auto opacity-50" />
            <p className="mt-3 font-medium text-mist">Nenhum compromisso agendado.</p>
            <p className="mt-1 text-sm text-faint">
              Mova um lead pra <span className="text-st-agen">Agendado</span> com data/hora pra ele aparecer aqui.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            {sections.map((sec) => (
              <section key={sec.key}>
                <h2
                  className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest ${
                    sec.danger ? "text-st-perd" : sec.today ? "text-signal" : "text-faint"
                  }`}
                >
                  {sec.danger ? <IconWarn size={14} /> : <IconCalendar size={14} />}
                  {sec.label}
                  <span className="num font-normal opacity-60">· {sec.items.length}</span>
                </h2>

                <ul className="mt-3 space-y-2.5">
                  {sec.items.map((l) => (
                    <li key={l.id} className={`card p-4 ${sec.danger ? "!border-st-perd/25" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {/* horário */}
                          <div
                            className={`num flex shrink-0 flex-col items-center rounded-xl border px-3 py-1.5 ${
                              sec.danger
                                ? "border-st-perd/40 text-st-perd"
                                : "border-st-agen/40 text-st-agen"
                            }`}
                          >
                            <IconClock size={14} />
                            <span className="mt-0.5 text-sm font-bold">{formatTimeBR(l.scheduled_at)}</span>
                          </div>
                          <div>
                            <Link
                              href={`/painel/lead/${l.id}`}
                              className="font-semibold transition-colors hover:text-signal"
                            >
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
                            {l.scheduled_note && (
                              <p className="mt-1.5 text-xs text-mist">📝 {l.scheduled_note}</p>
                            )}
                          </div>
                        </div>

                        <Link
                          href={`/painel/lead/${l.id}`}
                          className="flex items-center gap-1.5 text-xs font-medium text-mist transition-colors hover:text-signal"
                        >
                          <IconChat size={13} /> Abrir
                          <IconAdvance size={12} />
                        </Link>
                      </div>

                      {/* ações rápidas */}
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
                        <form action={updateLead} className="flex items-center gap-2">
                          <input type="hidden" name="leadId" value={l.id} />
                          <button
                            type="submit"
                            name="stage"
                            value="vendido"
                            className="flex items-center gap-1.5 rounded-xl bg-signal px-3 py-1.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]"
                          >
                            <IconSale size={14} /> Vendido
                          </button>
                          <input
                            name="value"
                            inputMode="decimal"
                            placeholder="valor R$"
                            className="num w-24 rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
                          />
                          <button
                            type="submit"
                            name="stage"
                            value="perdido"
                            className="rounded-xl border border-line px-3 py-1.5 text-sm text-faint transition-colors hover:border-st-perd/50 hover:text-st-perd"
                          >
                            Não fechou
                          </button>
                        </form>

                        <form action={scheduleLead} className="flex items-center gap-1.5">
                          <input type="hidden" name="leadId" value={l.id} />
                          <input
                            type="datetime-local"
                            name="scheduledAt"
                            required
                            defaultValue={isoToBrLocalInput(l.scheduled_at)}
                            className="num rounded-xl border border-line bg-transparent px-2.5 py-1.5 text-xs focus:border-signal/60 focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="flex items-center gap-1 rounded-xl border border-line2 bg-pane2 px-2.5 py-1.5 text-xs font-medium text-snow transition-colors hover:border-signal/50 hover:text-signal"
                            title="reagendar"
                          >
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

        <div className="mt-8 text-xs text-faint" title="horário de Brasília">
          <IconClock size={12} className="mr-1 inline" />
          horários em Brasília (BRT)
        </div>
      </div>
    </main>
  );
}

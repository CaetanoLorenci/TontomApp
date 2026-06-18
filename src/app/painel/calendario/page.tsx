import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { brDayKey, formatTimeBR } from "@/lib/format";
import { monthGrid, googleCalUrl } from "@/lib/calendar";
import { LogoMark, IconCalendar, IconFunnel, IconChat, IconAdvance } from "@/components/icons";

export const dynamic = "force-dynamic";

/* Calendário — grade do mês (cara de Google Agenda) com os agendamentos dos leads.
   Cada compromisso tem link "Adicionar ao Google Agenda". Fuso de Brasília. */

type Appt = {
  id: string;
  name: string | null;
  phone: string;
  scheduled_at: string;
  clicks: { utm_campaign: string | null } | null;
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default async function Calendario({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const todayKey = brDayKey(new Date());
  const anchor = m && /^\d{4}-\d{2}$/.test(m) ? m : todayKey.slice(0, 7);
  const [year, month1] = anchor.split("-").map(Number);

  const grid = monthGrid(year, month1);

  const sb = supabaseAdmin();
  const startIso = new Date(`${grid.days[0].key}T00:00:00-03:00`).toISOString();
  const endIso = new Date(`${grid.days[41].key}T23:59:59-03:00`).toISOString();
  const { data } = await sb
    .from("leads")
    .select("id, name, phone, scheduled_at, clicks(utm_campaign)")
    .eq("stage", "agendado")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", startIso)
    .lte("scheduled_at", endIso)
    .order("scheduled_at", { ascending: true });

  const appts = (data ?? []) as unknown as Appt[];
  const byDay = new Map<string, Appt[]>();
  for (const a of appts) {
    const k = brDayKey(new Date(a.scheduled_at));
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(a);
  }

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
            <Link href="/painel/agenda" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-mist transition-colors hover:text-snow">
              Agenda
            </Link>
            <span className="flex items-center gap-1.5 rounded-lg bg-signal-soft px-3 py-1.5 font-semibold text-signal">
              <IconCalendar size={14} /> Calendário
            </span>
          </nav>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-6">
        {/* navegação de mês */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold capitalize">{grid.label}</h1>
          <div className="flex gap-1.5">
            <Link
              href={`/painel/calendario?m=${grid.prev}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-mist transition-colors hover:border-line2 hover:text-snow"
              aria-label="mês anterior"
            >
              <IconAdvance size={15} className="rotate-180" />
            </Link>
            <Link
              href="/painel/calendario"
              className="rounded-lg border border-line px-3 py-1.5 text-xs text-mist transition-colors hover:border-line2 hover:text-snow"
            >
              Hoje
            </Link>
            <Link
              href={`/painel/calendario?m=${grid.next}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-mist transition-colors hover:border-line2 hover:text-snow"
              aria-label="próximo mês"
            >
              <IconAdvance size={15} />
            </Link>
          </div>
        </div>

        {/* cabeçalho dos dias da semana */}
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-widest text-faint">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>

        {/* grade */}
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {grid.days.map((d) => {
            const items = byDay.get(d.key) ?? [];
            const isToday = d.key === todayKey;
            return (
              <div
                key={d.key}
                className={`min-h-24 rounded-lg border p-1.5 ${
                  d.inMonth ? "border-line bg-pane/40" : "border-line/40 bg-transparent"
                } ${isToday ? "!border-signal/60" : ""}`}
              >
                <div className={`num mb-1 text-xs ${isToday ? "font-bold text-signal" : d.inMonth ? "text-mist" : "text-faint"}`}>
                  {d.day}
                </div>
                <div className="flex flex-col gap-1">
                  {items.map((a) => (
                    <div
                      key={a.id}
                      className="group flex items-center gap-1 rounded-md bg-st-agen/15 px-1.5 py-1 text-[11px] text-st-agen"
                      title={a.name ?? "Sem nome"}
                    >
                      <Link href={`/painel/lead/${a.id}`} className="min-w-0 flex-1 truncate hover:underline">
                        <span className="num font-semibold">{formatTimeBR(a.scheduled_at)}</span>{" "}
                        {a.name ?? "Sem nome"}
                      </Link>
                      <a
                        href={googleCalUrl({
                          title: `${a.name ?? "Lead"} — Amplia`,
                          startIso: a.scheduled_at,
                          details: `WhatsApp: ${a.phone}${a.clicks?.utm_campaign ? ` · ${a.clicks.utm_campaign}` : ""}`,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded px-1 font-bold opacity-50 transition-opacity hover:opacity-100"
                        title="Adicionar ao Google Agenda"
                      >
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
      </div>
    </main>
  );
}

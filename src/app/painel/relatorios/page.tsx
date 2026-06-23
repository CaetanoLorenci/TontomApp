import Link from "next/link";
import { getScope } from "@/lib/auth";
import { brl } from "@/lib/format";
import { PanelNav } from "@/components/panel-nav";
import { IconCash, IconChat, IconTrend, IconWarn, IconBroadcast, IconCalendar } from "@/components/icons";
import { getRelatorioMeta } from "@/lib/relatorios/meta";
import { resolvePeriodo, PRESETS } from "@/lib/relatorios/periodo";
import { gerarLeitura } from "@/lib/relatorios/leitura";

export const dynamic = "force-dynamic";

/* Relatório de campanhas (Meta) — desempenho por período que o cliente escolher.
   Anti-vaidade: custo por RESULTADO real (conversa/lead), não alcance.
   O cruzamento com vendas/CAC vive na página Anúncios; aqui é a foto da mídia. */

const int = (n: number) => Math.round(n).toLocaleString("pt-BR");

export default async function Relatorios({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; since?: string; until?: string }>;
}) {
  const sp = await searchParams;
  const { seesAll } = await getScope();
  const periodo = resolvePeriodo(sp);
  const rel = await getRelatorioMeta(periodo.since, periodo.until);
  const { total } = rel;
  const leitura = gerarLeitura(rel);

  const stats = [
    { label: "Investido", value: brl.format(total.gasto), icon: IconCash },
    {
      label: "Resultados",
      value: int(total.resultados),
      hint: `${int(total.conversas)} conversas · ${int(total.leadsForm)} leads`,
      icon: IconChat,
    },
    { label: "Custo por resultado", value: total.cpr != null ? brl.format(total.cpr) : "—", icon: IconTrend, accent: true },
    { label: "CTR médio", value: `${total.ctr.toFixed(2)}%`, icon: IconBroadcast },
    { label: "Frequência", value: total.frequencia.toFixed(2), icon: IconWarn },
  ];

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />

      <PanelNav
        active="relatorios"
        seesAll={seesAll}
        right={
          <nav className="flex shrink-0 rounded-xl border border-line bg-pane p-1 text-sm">
            {PRESETS.map((p) => (
              <Link
                key={p.key}
                href={`/painel/relatorios?preset=${p.key}`}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${
                  p.key === periodo.preset
                    ? "bg-signal-soft font-semibold text-signal"
                    : "text-mist hover:text-snow"
                }`}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-6">
        {/* cabeçalho do período + escolha livre de/até */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <IconCalendar size={18} className="text-signal" />
            Relatório — <span className="capitalize text-signal">{periodo.label}</span>
          </h1>
          <form method="get" action="/painel/relatorios" className="flex flex-wrap items-end gap-2 text-sm">
            <label className="flex flex-col gap-0.5 text-[11px] uppercase tracking-widest text-faint">
              De
              <input
                type="date"
                name="since"
                defaultValue={periodo.since}
                style={{ colorScheme: "dark" }}
                className="rounded-xl border border-line bg-pane px-2 py-1.5 text-snow focus:border-signal/60 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] uppercase tracking-widest text-faint">
              Até
              <input
                type="date"
                name="until"
                defaultValue={periodo.until}
                style={{ colorScheme: "dark" }}
                className="rounded-xl border border-line bg-pane px-2 py-1.5 text-snow focus:border-signal/60 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded-xl border border-line2 bg-pane2 px-3 py-2 font-medium text-snow transition-colors hover:border-signal/50 hover:text-signal"
            >
              Gerar
            </button>
          </form>
        </div>

        {/* resumo executivo */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className={`card p-4 ${s.accent ? "!border-signal/30" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">{s.label}</span>
                <s.icon size={16} className={s.accent ? "text-signal" : "text-faint"} />
              </div>
              <div className={`num mt-2 truncate text-2xl font-bold ${s.accent ? "text-signal" : ""}`}>{s.value}</div>
              {s.hint && <div className="num mt-0.5 text-xs text-faint">{s.hint}</div>}
            </div>
          ))}
        </section>

        {/* o que esse período diz */}
        <section className="card mt-4 p-5">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-faint">
            <IconTrend size={14} className="text-signal" /> O que esse período diz
          </h2>
          <ul className="mt-3 space-y-2.5">
            {leitura.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-mist">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                {b}
              </li>
            ))}
          </ul>
        </section>

        {/* por campanha */}
        <section className="card mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-widest text-faint">
                <th className="p-3 font-semibold">Campanha</th>
                <th className="p-3 text-right font-semibold">Gasto</th>
                <th className="p-3 text-right font-semibold">Resultados</th>
                <th className="p-3 text-right font-semibold">Custo/result.</th>
                <th className="p-3 text-right font-semibold">CTR</th>
                <th className="p-3 text-right font-semibold">Freq.</th>
              </tr>
            </thead>
            <tbody>
              {rel.campanhas.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-faint">Sem veiculação no período.</td>
                </tr>
              )}
              {rel.campanhas.map((c, i) => {
                const vaidade = c.gasto > 0 && c.resultados === 0;
                return (
                  <tr key={i} className="border-b border-line/50 last:border-0">
                    <td className="p-3">
                      <span className="font-medium">{c.campanha ?? "(sem nome)"}</span>
                      {vaidade && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-st-perd/10 px-1.5 py-0.5 text-[10px] font-bold text-st-perd">
                          <IconWarn size={10} /> sem resultado
                        </span>
                      )}
                    </td>
                    <td className="num p-3 text-right">{brl.format(c.gasto)}</td>
                    <td className="num p-3 text-right font-semibold">{c.resultados || "—"}</td>
                    <td className="num p-3 text-right">{c.cpr != null ? brl.format(c.cpr) : "—"}</td>
                    <td className="num p-3 text-right text-mist">{c.ctr.toFixed(2)}%</td>
                    <td className="num p-3 text-right text-mist">{c.frequencia.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* criativos */}
        <section className="card mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-widest text-faint">
                <th className="p-3 font-semibold">Criativo</th>
                <th className="p-3 font-semibold">Campanha</th>
                <th className="p-3 text-right font-semibold">Gasto</th>
                <th className="p-3 text-right font-semibold">Result.</th>
                <th className="p-3 text-right font-semibold">Custo/result.</th>
                <th className="p-3 text-right font-semibold">Freq.</th>
              </tr>
            </thead>
            <tbody>
              {rel.criativos.slice(0, 10).map((a, i) => (
                <tr key={i} className="border-b border-line/50 last:border-0">
                  <td className="p-3 font-medium">{a.criativo ?? "(sem nome)"}</td>
                  <td className="p-3 text-mist">{a.campanha ?? "—"}</td>
                  <td className="num p-3 text-right">{brl.format(a.gasto)}</td>
                  <td className="num p-3 text-right font-semibold">{a.resultados || "—"}</td>
                  <td className="num p-3 text-right">{a.cpr != null ? brl.format(a.cpr) : "—"}</td>
                  <td className="num p-3 text-right text-mist">{a.frequencia.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="mt-3 text-xs text-faint">
          <IconCash size={12} className="mr-1 inline text-signal" />
          Dados de mídia direto da Meta (ads_read) · resultado = conversa de WhatsApp + lead de formulário · período {periodo.label}.
        </p>
      </div>
    </main>
  );
}
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { getAccountFinance, getAdsPerformance, getAdCreatives, type AdPerf } from "@/lib/meta-ads";
import { brl } from "@/lib/format";
import { LogoMark, IconChat, IconFunnel, IconCalendar, IconBroadcast, IconWarn, IconSale, IconTrend } from "@/components/icons";

export const dynamic = "force-dynamic";

/* Anúncios — central de comando: cruza gasto/conversas do Meta (ads_read) com
   leads/vendas/faturamento do Tontom → ROI real por anúncio. Saldo + alertas. */

const PERIODS: Record<string, { label: string; preset: string; days: number }> = {
  "7d": { label: "7d", preset: "last_7d", days: 7 },
  "30d": { label: "30d", preset: "last_30d", days: 30 },
  "90d": { label: "90d", preset: "last_90d", days: 90 },
};

type Agg = { perf?: AdPerf; leads: number; agendados: number; vendas: number; fat: number };

export default async function Anuncios({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const period = PERIODS[p ?? "30d"] ? (p ?? "30d") : "30d";
  const since = new Date(Date.now() - PERIODS[period].days * 86_400_000).toISOString();

  const sb = supabaseAdmin();
  const [finance, perf, { data: leadRows }] = await Promise.all([
    getAccountFinance(),
    getAdsPerformance(PERIODS[period].preset),
    sb.from("leads").select("stage, value, created_at, clicks(ad_id)").gte("created_at", since),
  ]);

  // une por ad_id: performance do Meta + resultados do Tontom
  const map = new Map<string, Agg>();
  const get = (id: string) => map.get(id) ?? map.set(id, { leads: 0, agendados: 0, vendas: 0, fat: 0 }).get(id)!;
  for (const r of perf) if (r.adId) get(r.adId).perf = r;
  for (const l of (leadRows ?? []) as unknown as { stage: string; value: number | null; clicks: { ad_id: string | null } | null }[]) {
    const id = l.clicks?.ad_id;
    if (!id) continue;
    const a = get(id);
    a.leads++;
    if (["agendado", "vendido"].includes(l.stage)) a.agendados++;
    if (l.stage === "vendido") {
      a.vendas++;
      a.fat += l.value ?? 0;
    }
  }

  const creatives = await getAdCreatives(sb, [...map.keys()]);

  const rows = [...map.entries()].map(([adId, a]) => {
    const spend = a.perf?.spend ?? 0;
    const cpl = a.leads > 0 ? spend / a.leads : null;
    const cac = a.vendas > 0 ? spend / a.vendas : null;
    const roas = spend > 0 ? a.fat / spend : null;
    return { adId, a, spend, cpl, cac, roas, cr: creatives.get(adId) ?? null };
  });
  rows.sort((x, y) => y.spend - x.spend);

  // alertas/recomendação
  const cpls = rows.filter((r) => r.cpl != null).map((r) => r.cpl!) as number[];
  const avgCpl = cpls.length ? cpls.reduce((s, v) => s + v, 0) / cpls.length : 0;
  const bestRoiId = rows.filter((r) => r.roas != null && r.a.vendas > 0).sort((x, y) => (y.roas ?? 0) - (x.roas ?? 0))[0]?.adId;

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalFat = rows.reduce((s, r) => s + r.a.fat, 0);
  const totalVendas = rows.reduce((s, r) => s + r.a.vendas, 0);

  const saldoBaixo = finance?.balanceValue != null && finance.balanceValue < 50;

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />

      <header className="sticky top-0 z-20 border-b border-line bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/painel" className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="font-head text-lg font-extrabold tracking-tight">tontom<span className="text-signal">.</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <nav className="flex rounded-xl border border-line bg-pane p-1 text-sm">
              <Link href="/painel" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-mist transition-colors hover:text-snow"><IconChat size={14} /> Painel</Link>
              <Link href="/painel/pipeline" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-mist transition-colors hover:text-snow"><IconFunnel size={14} /> Pipeline</Link>
              <Link href="/painel/agenda" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-mist transition-colors hover:text-snow"><IconCalendar size={14} /> Agenda</Link>
              <span className="flex items-center gap-1.5 rounded-lg bg-signal-soft px-3 py-1.5 font-semibold text-signal"><IconBroadcast size={14} /> Anúncios</span>
            </nav>
            <nav className="flex rounded-xl border border-line bg-pane p-1 text-sm">
              {Object.entries(PERIODS).map(([k, v]) => (
                <Link key={k} href={`/painel/anuncios?p=${k}`} className={`rounded-lg px-3 py-1.5 transition-colors ${k === period ? "bg-signal-soft font-semibold text-signal" : "text-mist hover:text-snow"}`}>{v.label}</Link>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-6">
        {/* saldo + totais */}
        <section className="grid gap-3 sm:grid-cols-4">
          <div className={`card p-4 ${saldoBaixo ? "!border-st-perd/50" : "!border-signal/30"}`}>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-faint">
              {saldoBaixo && <IconWarn size={12} className="text-st-perd" />} Saldo da conta
            </span>
            <div className={`num mt-1 text-2xl font-bold ${saldoBaixo ? "text-st-perd" : "text-signal"}`}>
              {finance?.balanceValue != null ? brl.format(finance.balanceValue) : "—"}
            </div>
            {saldoBaixo && <div className="mt-0.5 text-xs text-st-perd">saldo baixo — recarregue</div>}
          </div>
          <div className="card p-4">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">Gasto ({PERIODS[period].label})</span>
            <div className="num mt-1 text-2xl font-bold">{brl.format(totalSpend)}</div>
          </div>
          <div className="card p-4">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">Vendas</span>
            <div className="num mt-1 text-2xl font-bold">{totalVendas}</div>
          </div>
          <div className="card p-4 !border-signal/30">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">ROAS geral</span>
            <div className="num mt-1 text-2xl font-bold text-signal">{totalSpend > 0 ? `${(totalFat / totalSpend).toFixed(1)}x` : "—"}</div>
            <div className="mt-0.5 text-xs text-faint">{brl.format(totalFat)} faturado</div>
          </div>
        </section>

        {/* tabela ROI por anúncio */}
        <section className="card mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-widest text-faint">
                <th className="p-3 font-semibold">Anúncio</th>
                <th className="p-3 text-right font-semibold">Gasto</th>
                <th className="p-3 text-right font-semibold">Conversas</th>
                <th className="p-3 text-right font-semibold">Leads</th>
                <th className="p-3 text-right font-semibold">Vendas</th>
                <th className="p-3 text-right font-semibold">Faturamento</th>
                <th className="p-3 text-right font-semibold">CPL</th>
                <th className="p-3 text-right font-semibold">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-faint">Sem dados de anúncio no período.</td></tr>
              )}
              {rows.map((r) => {
                const cplAlto = r.cpl != null && avgCpl > 0 && r.cpl > avgCpl * 1.5;
                const melhor = r.adId === bestRoiId;
                const nome = r.cr?.campaign_name ?? r.a.perf?.campaignName ?? "(campanha)";
                const sub = [r.cr?.ad_name ?? r.a.perf?.adName].filter(Boolean).join("");
                return (
                  <tr key={r.adId} className="border-b border-line/50 last:border-0">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {r.cr?.image_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.cr.image_path} alt="" className="h-9 w-9 shrink-0 rounded border border-line object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-pane2"><IconBroadcast size={14} className="text-signal" /></div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{nome}</span>
                            {melhor && <span className="inline-flex items-center gap-0.5 rounded-full bg-signal-soft px-1.5 py-0.5 text-[10px] font-bold text-signal"><IconTrend size={10} /> melhor ROI</span>}
                          </div>
                          {sub && <div className="num truncate text-xs text-faint">{sub}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="num p-3 text-right">{brl.format(r.spend)}</td>
                    <td className="num p-3 text-right text-mist">{r.a.perf?.conversations ?? 0}</td>
                    <td className="num p-3 text-right">{r.a.leads}</td>
                    <td className="num p-3 text-right font-semibold">{r.a.vendas || "—"}</td>
                    <td className="num p-3 text-right font-semibold text-signal">{r.a.fat ? brl.format(r.a.fat) : "—"}</td>
                    <td className={`num p-3 text-right ${cplAlto ? "font-bold text-st-perd" : ""}`}>
                      {r.cpl != null ? brl.format(r.cpl) : "—"}
                      {cplAlto && <span title="CPL bem acima da média"> ⚠</span>}
                    </td>
                    <td className="num p-3 text-right font-semibold">{r.roas != null ? `${r.roas.toFixed(1)}x` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <p className="mt-3 text-xs text-faint">
          <IconSale size={12} className="mr-1 inline text-signal" />
          ROI real = gasto do Meta cruzado com vendas do Tontom · <span className="text-st-perd">CPL ⚠</span> = bem acima da média · <span className="text-signal">melhor ROI</span> = recomendação de verba · gasto/conversas dos últimos {PERIODS[period].label}.
        </p>
      </div>
    </main>
  );
}

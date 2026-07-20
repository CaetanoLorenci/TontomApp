// Hub Gestor — saúde das contas de anúncio gerenciadas (Fase 1: o "semáforo da manhã").
// Busca por conta: status/saldo + insights de ontem/7d/30d, e INTERPRETA:
// vermelho = agir agora · amarelo = de olho · verde = rodando bem.
// Token: META_GESTOR_TOKEN (usuário do Caetano no BM da Optimize, quando existir)
// com fallback pro META_ADS_TOKEN (system user da Amplia). Um lugar só decide.

const GRAPH = process.env.META_GRAPH_VERSION || "v21.0"; // || (não ??): env vazia também cai no default

function adsToken(): string | null {
  return process.env.META_GESTOR_TOKEN || process.env.META_ADS_TOKEN || null;
}

export type ManagedAccount = {
  id: string;
  act_id: string;
  client_name: string;
  monthly_budget: number | null;
  target_cpa: number | null;
  notes: string | null;
  active: boolean;
  next_action: string | null; // "próxima ação" pendente (mini-tarefa do semáforo)
  next_action_at: string | null;
  objective: string; // 'auto' | 'compras' | 'leads' | 'conversas' — qual resultado a conta persegue
  report_metrics: string[]; // extras no relatório: 'impressoes' | 'cliques' | 'ctr' | 'cpm'
};

type Insights = { spend: number; results: number; resultLabel: string | null };

export type AccountHealth = {
  account: ManagedAccount;
  ok: boolean; // false = não conseguiu ler a conta (token sem acesso, conta inválida…)
  error: string | null;
  accountName: string | null; // nome real no Meta (confere se o act_id é o certo)
  status: number; // 1 = ativa
  currency: string;
  balanceValue: number | null; // saldo pré-pago (R$) se houver
  yesterday: Insights;
  d7: Insights;
  d30: Insights;
  prev7: Insights; // a semana ANTERIOR aos últimos 7d (tendência ↑↓ sem abrir Gerenciador)
  level: "red" | "yellow" | "green";
  reasons: string[]; // interpretação legível ("por que essa cor")
};

// Extrai "resultados" priorizando o que importa: compra > lead > conversa iniciada.
// Contas diferentes otimizam pra coisas diferentes — pega o primeiro tipo com volume.
const RESULT_GROUPS: { label: string; types: string[] }[] = [
  { label: "compras", types: ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"] },
  { label: "leads", types: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"] },
  { label: "conversas", types: ["onsite_conversion.messaging_conversation_started_7d"] },
];

function countGroup(
  actions: { action_type: string; value: string }[] | undefined,
  g: { label: string; types: string[] },
): number {
  return (actions ?? [])
    .filter((a) => g.types.some((t) => a.action_type === t || a.action_type.includes(t)))
    .reduce((s, a) => s + Number(a.value || 0), 0);
}

// objective 'auto' = pega o primeiro grupo com volume (compra > lead > conversa);
// objective fixo = conta SÓ aquele grupo (mesmo que dê zero — honestidade no relatório).
function pickResults(
  actions: { action_type: string; value: string }[] | undefined,
  objective: string = "auto",
): { results: number; resultLabel: string | null } {
  if (objective !== "auto") {
    const g = RESULT_GROUPS.find((x) => x.label === objective);
    if (g) return { results: countGroup(actions, g), resultLabel: g.label };
  }
  for (const g of RESULT_GROUPS) {
    const n = countGroup(actions, g);
    if (n > 0) return { results: n, resultLabel: g.label };
  }
  return { results: 0, resultLabel: null };
}

async function graphGet(path: string, token: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// semana anterior à janela dos últimos 7d: [hoje-14, hoje-8]
function prev7Range(): string {
  const day = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  return encodeURIComponent(JSON.stringify({ since: day(14), until: day(8) }));
}

async function insightsFor(actId: string, preset: string, token: string, objective = "auto"): Promise<Insights> {
  const range = preset === "prev_7d" ? `time_range=${prev7Range()}` : `date_preset=${preset}`;
  const json = await graphGet(
    `act_${actId}/insights?fields=spend,actions&${range}`,
    token,
  );
  const row = ((json?.data as Record<string, unknown>[] | undefined) ?? [])[0] as
    | { spend?: string; actions?: { action_type: string; value: string }[] }
    | undefined;
  const { results, resultLabel } = pickResults(row?.actions, objective);
  return { spend: Number(row?.spend || 0), results, resultLabel };
}

// ── Insights de RELATÓRIO: período livre + métricas extras (impressões/cliques/ctr/cpm) ──
export type ReportInsights = Insights & {
  impressions: number;
  clicks: number;
  ctr: number | null; // % (cliques/impressões, como o Meta reporta)
  cpm: number | null;
};

export async function reportInsights(
  actId: string,
  since: string,
  until: string,
  objective = "auto",
): Promise<ReportInsights> {
  const token = adsToken();
  const empty: ReportInsights = {
    spend: 0, results: 0, resultLabel: null, impressions: 0, clicks: 0, ctr: null, cpm: null,
  };
  if (!token) return empty;
  const range = encodeURIComponent(JSON.stringify({ since, until }));
  const json = await graphGet(
    `act_${actId}/insights?fields=spend,actions,impressions,clicks,ctr,cpm&time_range=${range}`,
    token,
  );
  const row = ((json?.data as Record<string, unknown>[] | undefined) ?? [])[0] as
    | {
        spend?: string;
        actions?: { action_type: string; value: string }[];
        impressions?: string;
        clicks?: string;
        ctr?: string;
        cpm?: string;
      }
    | undefined;
  if (!row) return empty;
  const { results, resultLabel } = pickResults(row.actions, objective);
  return {
    spend: Number(row.spend || 0),
    results,
    resultLabel,
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    ctr: row.ctr != null ? Number(row.ctr) : null,
    cpm: row.cpm != null ? Number(row.cpm) : null,
  };
}

const cpa = (i: Insights): number | null => (i.results > 0 ? i.spend / i.results : null);

// Regras do semáforo — o valor da tela é a INTERPRETAÇÃO, não o número cru.
function judge(h: Omit<AccountHealth, "level" | "reasons">): { level: AccountHealth["level"]; reasons: string[] } {
  const red: string[] = [];
  const yellow: string[] = [];
  const budget = h.account.monthly_budget;

  if (!h.ok) return { level: "red", reasons: [h.error ?? "não consegui ler a conta (acesso/token)"] };
  if (h.status !== 1) red.push("conta desativada/restrita no Meta");
  if (h.balanceValue != null && h.balanceValue < 50) red.push(`saldo quase no fim (R$ ${h.balanceValue.toFixed(2)})`);
  else if (h.balanceValue != null && h.balanceValue < 150) yellow.push(`saldo baixo (R$ ${h.balanceValue.toFixed(2)})`);

  // conta que deveria rodar e gastou ZERO ontem = parada (rejeição, verba, pausa…)
  if ((budget ?? 0) > 0 && h.yesterday.spend === 0) red.push("gastou R$ 0 ontem — conta parada?");

  // custo por resultado vs alvo (se houver) ou vs a média da própria conta em 30d
  const cy = cpa(h.yesterday);
  const c30 = cpa(h.d30);
  const target = h.account.target_cpa ?? c30;
  if (cy != null && target != null && target > 0) {
    if (cy > target * 1.5) red.push(`custo/resultado ontem (R$ ${cy.toFixed(2)}) estourou 1,5× o alvo (R$ ${target.toFixed(2)})`);
    else if (cy > target * 1.2) yellow.push(`custo/resultado ontem (R$ ${cy.toFixed(2)}) acima do alvo (R$ ${target.toFixed(2)})`);
  }

  // gasto de ontem despencou vs ritmo dos 7d (entrega caindo)
  const daily7 = h.d7.spend / 7;
  if (daily7 > 0 && h.yesterday.spend > 0 && h.yesterday.spend < daily7 * 0.5) {
    yellow.push("entrega de ontem caiu >50% vs o ritmo da semana");
  }

  // rodou a semana inteira sem NENHUM resultado
  if (h.d7.spend > 0 && h.d7.results === 0) red.push(`R$ ${h.d7.spend.toFixed(2)} gastos em 7d sem nenhum resultado rastreado`);

  if (red.length) return { level: "red", reasons: [...red, ...yellow] };
  if (yellow.length) return { level: "yellow", reasons: yellow };
  return { level: "green", reasons: ["rodando dentro do esperado"] };
}

export async function accountHealth(account: ManagedAccount): Promise<AccountHealth> {
  const token = adsToken();
  const base: Omit<AccountHealth, "level" | "reasons"> = {
    account,
    ok: false,
    error: token ? null : "META_GESTOR_TOKEN/META_ADS_TOKEN ausente",
    accountName: null,
    status: 0,
    currency: "BRL",
    balanceValue: null,
    yesterday: { spend: 0, results: 0, resultLabel: null },
    d7: { spend: 0, results: 0, resultLabel: null },
    d30: { spend: 0, results: 0, resultLabel: null },
    prev7: { spend: 0, results: 0, resultLabel: null },
  };
  if (!token) return { ...base, ...judge(base) };

  const [info, yesterday, d7, d30, prev7] = await Promise.all([
    graphGet(`act_${account.act_id}?fields=name,account_status,currency,funding_source_details`, token),
    insightsFor(account.act_id, "yesterday", token, account.objective),
    insightsFor(account.act_id, "last_7d", token, account.objective),
    insightsFor(account.act_id, "last_30d", token, account.objective),
    insightsFor(account.act_id, "prev_7d", token, account.objective),
  ]);

  if (!info) {
    const failed = { ...base, error: "sem acesso à conta (token não enxerga o act_id?)" };
    return { ...failed, ...judge(failed) };
  }

  const fundingText = (info.funding_source_details as { display_string?: string } | undefined)?.display_string ?? null;
  const m = fundingText?.match(/([\d.]+,\d{2})/);
  const filled: Omit<AccountHealth, "level" | "reasons"> = {
    ...base,
    ok: true,
    accountName: (info.name as string) ?? null,
    status: (info.account_status as number) ?? 0,
    currency: (info.currency as string) ?? "BRL",
    balanceValue: m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : null,
    yesterday,
    d7,
    d30,
    prev7,
  };
  return { ...filled, ...judge(filled) };
}

// Quebra por campanha (7d) — mostra QUAL campanha puxa o gasto/custo da conta.
export type CampaignPerf = {
  name: string;
  spend: number;
  results: number;
  resultLabel: string | null;
};

export async function campaignBreakdown(
  actId: string,
  opts?: { since: string; until: string; objective?: string },
): Promise<CampaignPerf[]> {
  const token = adsToken();
  if (!token) return [];
  const range = opts
    ? `time_range=${encodeURIComponent(JSON.stringify({ since: opts.since, until: opts.until }))}`
    : "date_preset=last_7d";
  const json = await graphGet(
    `act_${actId}/insights?level=campaign&fields=campaign_name,spend,actions&${range}&limit=50`,
    token,
  );
  const rows = (json?.data as
    | { campaign_name?: string; spend?: string; actions?: { action_type: string; value: string }[] }[]
    | undefined) ?? [];
  return rows
    .map((r) => {
      const { results, resultLabel } = pickResults(r.actions, opts?.objective ?? "auto");
      return { name: r.campaign_name ?? "(sem nome)", spend: Number(r.spend || 0), results, resultLabel };
    })
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend);
}

// ── Relatório formatado pro WhatsApp (copiar/compartilhar) ──
// Texto pronto com *negrito*/_itálico_ do WhatsApp: 7d vs semana anterior,
// 30d, top campanhas e a leitura interpretada. Economiza a hora do relatório.
const fBRL = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const varTxt = (cur: number, prev: number): string => {
  if (!(prev > 0)) return "";
  const p = Math.round(((cur - prev) / prev) * 100);
  if (Math.abs(p) < 5) return " (estável)";
  return ` (${p > 0 ? "+" : ""}${p}% vs semana anterior)`;
};

const fINT = (n: number) => n.toLocaleString("pt-BR");

export function buildWhatsAppReport(
  account: ManagedAccount,
  cur: ReportInsights,
  prev: ReportInsights,
  campaigns: CampaignPerf[],
  periodLabel: string,
): string {
  const cpa = (i: ReportInsights) => (i.results > 0 ? i.spend / i.results : null);
  const cCur = cpa(cur);
  const cPrev = cpa(prev);
  const label = cur.resultLabel ?? "resultados";
  const extras = account.report_metrics ?? [];

  const lines: string[] = [];
  lines.push(`*Relatório — ${account.client_name}*`);
  lines.push(`_${periodLabel}_`);
  lines.push("");
  lines.push(`💰 Investido: *${fBRL(cur.spend)}*${varTxt(cur.spend, prev.spend)}`);
  lines.push(`🎯 ${label[0].toUpperCase() + label.slice(1)}: *${cur.results}*${varTxt(cur.results, prev.results)}`);
  if (cCur != null) {
    const dir =
      cPrev != null && Math.abs(((cCur - cPrev) / cPrev) * 100) >= 5 ? (cCur < cPrev ? " ✅ melhorou" : " ⚠️ subiu") : "";
    lines.push(`📊 Custo por resultado: *${fBRL(cCur)}*${varTxt(cCur, cPrev ?? 0)}${dir}`);
  }

  // métricas extras — só as escolhidas na calibragem da conta
  const extraLines: string[] = [];
  if (extras.includes("impressoes") && cur.impressions > 0) extraLines.push(`👀 Impressões: *${fINT(cur.impressions)}*`);
  if (extras.includes("cliques") && cur.clicks > 0) extraLines.push(`🖱️ Cliques: *${fINT(cur.clicks)}*`);
  if (extras.includes("ctr") && cur.ctr != null) extraLines.push(`🎯 CTR: *${cur.ctr.toFixed(2).replace(".", ",")}%*`);
  if (extras.includes("cpm") && cur.cpm != null) extraLines.push(`📡 CPM: *${fBRL(cur.cpm)}*`);
  if (extraLines.length) {
    lines.push("");
    lines.push(...extraLines);
  }

  const top = campaigns.slice(0, 3);
  if (top.length > 0) {
    lines.push("");
    lines.push("*Campanhas:*");
    for (const c of top) {
      const ccpa = c.results > 0 ? ` · ${fBRL(c.spend / c.results)}/resultado` : " · sem resultado";
      lines.push(`• ${c.name}: ${fBRL(c.spend)} · ${c.results} ${c.resultLabel ?? ""}${ccpa}`);
    }
  }

  // leitura simples derivada do próprio período (sem depender do semáforo diário)
  lines.push("");
  let leitura: string;
  if (cur.spend === 0) leitura = "Sem investimento no período.";
  else if (cur.results === 0) leitura = `Investimento rodou sem ${label} registrados no período — em análise.`;
  else if (cPrev != null && cCur != null && cCur < cPrev * 0.95)
    leitura = `Custo por resultado melhorou vs período anterior — caminho certo.`;
  else if (cPrev != null && cCur != null && cCur > cPrev * 1.2)
    leitura = `Custo por resultado subiu vs período anterior — ajustes em andamento.`;
  else leitura = "Conta rodando dentro do esperado no período.";
  lines.push(`*Leitura:* ${leitura}`);
  return lines.join("\n");
}

const LEVEL_RANK = { red: 0, yellow: 1, green: 2 } as const;

// Saúde de todas as contas ativas, em paralelo, ordenada por urgência.
export async function allAccountsHealth(accounts: ManagedAccount[]): Promise<AccountHealth[]> {
  const hs = await Promise.all(accounts.filter((a) => a.active).map(accountHealth));
  return hs.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.d7.spend - a.d7.spend);
}

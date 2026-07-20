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

function pickResults(actions: { action_type: string; value: string }[] | undefined): {
  results: number;
  resultLabel: string | null;
} {
  for (const g of RESULT_GROUPS) {
    const n = (actions ?? [])
      .filter((a) => g.types.some((t) => a.action_type === t || a.action_type.includes(t)))
      .reduce((s, a) => s + Number(a.value || 0), 0);
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

async function insightsFor(actId: string, preset: string, token: string): Promise<Insights> {
  const range = preset === "prev_7d" ? `time_range=${prev7Range()}` : `date_preset=${preset}`;
  const json = await graphGet(
    `act_${actId}/insights?fields=spend,actions&${range}`,
    token,
  );
  const row = ((json?.data as Record<string, unknown>[] | undefined) ?? [])[0] as
    | { spend?: string; actions?: { action_type: string; value: string }[] }
    | undefined;
  const { results, resultLabel } = pickResults(row?.actions);
  return { spend: Number(row?.spend || 0), results, resultLabel };
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
    insightsFor(account.act_id, "yesterday", token),
    insightsFor(account.act_id, "last_7d", token),
    insightsFor(account.act_id, "last_30d", token),
    insightsFor(account.act_id, "prev_7d", token),
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

export async function campaignBreakdown(actId: string): Promise<CampaignPerf[]> {
  const token = adsToken();
  if (!token) return [];
  const json = await graphGet(
    `act_${actId}/insights?level=campaign&fields=campaign_name,spend,actions&date_preset=last_7d&limit=50`,
    token,
  );
  const rows = (json?.data as
    | { campaign_name?: string; spend?: string; actions?: { action_type: string; value: string }[] }[]
    | undefined) ?? [];
  return rows
    .map((r) => {
      const { results, resultLabel } = pickResults(r.actions);
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

export function buildWhatsAppReport(h: AccountHealth, campaigns: CampaignPerf[]): string {
  const a = h.account;
  const cpa = (i: Insights) => (i.results > 0 ? i.spend / i.results : null);
  const c7 = cpa(h.d7);
  const cPrev = cpa(h.prev7);
  const label = h.d7.resultLabel ?? h.d30.resultLabel ?? "resultados";

  const lines: string[] = [];
  lines.push(`*Relatório — ${a.client_name}*`);
  lines.push(`_Últimos 7 dias_`);
  lines.push("");
  lines.push(`💰 Investido: *${fBRL(h.d7.spend)}*${varTxt(h.d7.spend, h.prev7.spend)}`);
  lines.push(`🎯 ${label[0].toUpperCase() + label.slice(1)}: *${h.d7.results}*${varTxt(h.d7.results, h.prev7.results)}`);
  if (c7 != null) {
    const dir = cPrev != null && Math.abs(((c7 - cPrev) / cPrev) * 100) >= 5 ? (c7 < cPrev ? " ✅ melhorou" : " ⚠️ subiu") : "";
    lines.push(`📊 Custo por resultado: *${fBRL(c7)}*${varTxt(c7, cPrev ?? 0)}${dir}`);
  }
  lines.push("");
  lines.push(`_No mês (30d): ${fBRL(h.d30.spend)} investidos · ${h.d30.results} ${h.d30.resultLabel ?? "resultados"}_`);

  const top = campaigns.slice(0, 3);
  if (top.length > 0) {
    lines.push("");
    lines.push("*Campanhas (7d):*");
    for (const c of top) {
      const ccpa = c.results > 0 ? ` · ${fBRL(c.spend / c.results)}/resultado` : " · sem resultado";
      lines.push(`• ${c.name}: ${fBRL(c.spend)} · ${c.results} ${c.resultLabel ?? ""}${ccpa}`);
    }
  }

  lines.push("");
  const leitura =
    h.level === "green"
      ? "Conta saudável, rodando dentro do esperado."
      : h.reasons.join("; ") + ".";
  lines.push(`*Leitura:* ${leitura}`);
  return lines.join("\n");
}

const LEVEL_RANK = { red: 0, yellow: 1, green: 2 } as const;

// Saúde de todas as contas ativas, em paralelo, ordenada por urgência.
export async function allAccountsHealth(accounts: ManagedAccount[]): Promise<AccountHealth[]> {
  const hs = await Promise.all(accounts.filter((a) => a.active).map(accountHealth));
  return hs.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.d7.spend - a.d7.spend);
}

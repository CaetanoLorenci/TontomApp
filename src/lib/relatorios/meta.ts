// Relatórios — desempenho das campanhas direto da Meta (ads_read), para um
// PERÍODO arbitrário (since/until no formato YYYY-MM-DD). Espelha o padrão de
// @/lib/meta-ads, mas com intervalo de datas customizado: o cliente pede o
// período que quiser. Sem dependências novas — fetch nativo.

const GRAPH = process.env.META_GRAPH_VERSION || "v21.0";

export type Linha = {
  nivel: "campaign" | "ad";
  campanha: string | null;
  criativo: string | null;
  gasto: number;
  impressoes: number;
  alcance: number;
  cliques: number;
  ctr: number; // %
  frequencia: number;
  conversas: number; // conversas de WhatsApp iniciadas
  leadsForm: number; // leads de formulário (action "lead")
  resultados: number; // conversas + leadsForm (resultado real, anti-vaidade)
  cpr: number | null; // custo por resultado
};

export type Totais = {
  gasto: number;
  impressoes: number;
  alcance: number;
  cliques: number;
  conversas: number;
  leadsForm: number;
  resultados: number;
  ctr: number; // %
  frequencia: number;
  cpr: number | null;
};

type GraphRow = {
  campaign_name?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  frequency?: string;
  actions?: { action_type: string; value: string }[];
};

const num = (v: string | undefined) => Number(v || 0);

function sumAction(actions: GraphRow["actions"], match: (t: string) => boolean): number {
  return (actions ?? []).filter((a) => match(a.action_type)).reduce((s, a) => s + num(a.value), 0);
}

// Conversa de WhatsApp: a chave canônica é a janela de 7 dias; se a conta não
// expuser, cai no genérico "messaging_conversation_started".
function conversasFrom(actions: GraphRow["actions"]): number {
  const exata = sumAction(actions, (t) => t === "onsite_conversion.messaging_conversation_started_7d");
  if (exata > 0) return exata;
  return sumAction(actions, (t) => t.includes("messaging_conversation_started"));
}

// Lead de formulário: a chave canônica é "lead" (não somar as variações
// onsite_conversion.lead / lead_grouped / *_add_meta_leads — são o MESMO lead
// contado de outras formas, dariam contagem inflada).
function leadsFrom(actions: GraphRow["actions"]): number {
  return sumAction(actions, (t) => t === "lead");
}

function toLinha(nivel: "campaign" | "ad", r: GraphRow): Linha {
  const gasto = num(r.spend);
  const conversas = conversasFrom(r.actions);
  const leadsForm = leadsFrom(r.actions);
  const resultados = conversas + leadsForm;
  return {
    nivel,
    campanha: r.campaign_name ?? null,
    criativo: r.ad_name ?? null,
    gasto,
    impressoes: num(r.impressions),
    alcance: num(r.reach),
    cliques: num(r.clicks),
    ctr: num(r.ctr),
    frequencia: num(r.frequency),
    conversas,
    leadsForm,
    resultados,
    cpr: resultados > 0 ? gasto / resultados : null,
  };
}

async function fetchInsights(nivel: "campaign" | "ad", since: string, until: string): Promise<Linha[]> {
  const token = process.env.META_ADS_TOKEN;
  const act = process.env.META_AD_ACCOUNT_ID;
  if (!token || !act) return [];
  const fields = "campaign_name,ad_name,spend,impressions,reach,clicks,ctr,frequency,actions";
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const url =
    `https://graph.facebook.com/${GRAPH}/${act}/insights` +
    `?level=${nivel}&fields=${fields}&time_range=${timeRange}&limit=500`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error("[relatorios/meta] insights falhou:", nivel, res.status);
      return [];
    }
    const json = (await res.json()) as { data?: GraphRow[] };
    return (json.data ?? []).map((r) => toLinha(nivel, r));
  } catch (e) {
    console.error("[relatorios/meta] erro insights:", e);
    return [];
  }
}

function agregar(linhas: Linha[]): Totais {
  const t = linhas.reduce(
    (acc, l) => {
      acc.gasto += l.gasto;
      acc.impressoes += l.impressoes;
      acc.alcance += l.alcance;
      acc.cliques += l.cliques;
      acc.conversas += l.conversas;
      acc.leadsForm += l.leadsForm;
      acc.resultados += l.resultados;
      return acc;
    },
    { gasto: 0, impressoes: 0, alcance: 0, cliques: 0, conversas: 0, leadsForm: 0, resultados: 0 },
  );
  return {
    ...t,
    ctr: t.impressoes > 0 ? (t.cliques / t.impressoes) * 100 : 0,
    // frequência média aproximada (impressões/alcance da conta no período)
    frequencia: t.alcance > 0 ? t.impressoes / t.alcance : 0,
    cpr: t.resultados > 0 ? t.gasto / t.resultados : null,
  };
}

export type Relatorio = {
  campanhas: Linha[];
  criativos: Linha[];
  total: Totais;
};

export async function getRelatorioMeta(since: string, until: string): Promise<Relatorio> {
  const [campanhas, criativos] = await Promise.all([
    fetchInsights("campaign", since, until),
    fetchInsights("ad", since, until),
  ]);
  campanhas.sort((a, b) => b.gasto - a.gasto);
  criativos.sort((a, b) => b.gasto - a.gasto);
  return { campanhas, criativos, total: agregar(campanhas) };
}
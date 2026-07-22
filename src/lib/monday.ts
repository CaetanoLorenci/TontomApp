// Monday.com — SOMENTE LEITURA (decisão do Caetano, 22/jul/2026):
// o board é da Optimize; a integração interpreta e notifica. Qualquer escrita
// (status, item, comentário) só entra se ele pedir explicitamente, caso a caso.

const BOARD_ID = process.env.MONDAY_BOARD_ID || "18423098011"; // GT - CAETANO

export type MondayDemand = {
  name: string;
  group: string;
  status: string | null;
  priority: string | null;
  due: string | null; // aaaa-mm-dd
};

export async function mondayDemands(): Promise<MondayDemand[]> {
  const token = process.env.MONDAY_API_TOKEN?.trim(); // \r no fim quebraria o header
  if (!token) return [];
  try {
    const res = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query { boards(ids:[${BOARD_ID}]) { items_page(limit:100) { items { name group { title } column_values { column { title } text } } } } }`,
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { boards?: { items_page: { items: { name: string; group: { title: string }; column_values: { column: { title: string }; text: string | null }[] }[] } }[] };
    };
    const items = json.data?.boards?.[0]?.items_page.items ?? [];
    return items.map((it) => {
      const col = (t: string) => it.column_values.find((c) => c.column.title.toLowerCase() === t)?.text || null;
      return { name: it.name, group: it.group.title, status: col("status"), priority: col("prioridade"), due: col("data") };
    });
  } catch {
    return [];
  }
}

// o que merece entrar no push da manhã: não-concluído E (urgente OU com prazo até hoje)
export function urgentDemands(all: MondayDemand[], todayIso: string): MondayDemand[] {
  return all.filter((d) => {
    const open = !/realizado|conclu/i.test(d.status ?? "");
    const urgent = /urgente/i.test(d.priority ?? "");
    const dueNow = d.due != null && d.due <= todayIso;
    return open && (urgent || dueNow);
  });
}

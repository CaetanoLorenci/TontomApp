import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { allAccountsHealth, accountActivities, type ManagedAccount } from "@/lib/gestor";
import { firstSheetTitle, readRange, batchUpdateValues, appendRows } from "@/lib/google-sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Atualiza a planilha "SALDO CONTAS - CAETANO - OPTIMIZE" (Google Sheets) com a
// leitura do Meta: B = data da ÚLTIMA ALTERAÇÃO real na conta (histórico oficial,
// /activities — não a data da checagem), C = saldo pré-pago ou AUTOMÁTICO (cartão),
// D = qual foi a última alteração. Cliente sem linha é criado no fim.

const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const sheetId = process.env.SALDO_SHEET_ID;
  if (!sheetId) return NextResponse.json({ ok: false, error: "SALDO_SHEET_ID ausente" }, { status: 500 });

  const { data } = await supabaseAdmin()
    .from("managed_accounts")
    .select(
      "id, act_id, client_name, monthly_budget, target_cpa, notes, active, next_action, next_action_at, objective, report_metrics, client_goal, target_note",
    )
    .eq("active", true);
  const accounts = (data ?? []) as ManagedAccount[];
  let health = await allAccountsHealth(accounts);

  // Graph API às vezes falha 1 conta no meio do lote (rate limit) — uma segunda
  // chance após respiro resolve sem drama; quem falhar 2x fica pro dia seguinte.
  const failed = health.filter((h) => !h.ok).map((h) => h.account);
  if (failed.length) {
    await new Promise((r) => setTimeout(r, 4000));
    const retried = await allAccountsHealth(failed);
    health = health.map((h) => (h.ok ? h : retried.find((r) => r.account.id === h.account.id) ?? h));
  }

  const title = await firstSheetTitle(sheetId);
  if (!title) return NextResponse.json({ ok: false, error: "não li a planilha (compartilhou com o bot?)" }, { status: 502 });
  const col = await readRange(sheetId, `${title}!A1:A200`);
  if (!col) return NextResponse.json({ ok: false, error: "falha lendo coluna A" }, { status: 502 });

  // dd/mm/aaaa em Brasília a partir de um ISO do Meta (que já vem com -03:00)
  const brDate = (iso: string) => {
    const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  };

  const updates: { range: string; values: string[][] }[] = [];
  const appended: string[][] = [];
  const matched: string[] = [];
  const unmatched: string[] = [];

  for (const h of health) {
    if (!h.ok) {
      unmatched.push(`${h.account.client_name} (sem leitura do Meta)`);
      continue;
    }
    const hn = normName(h.account.client_name);
    // linha 1 é cabeçalho; nome bate se um contém o outro (Fonte ⊂ Fonte Negócios…)
    const rowIdx = col.findIndex(
      (r, i) => i > 0 && r[0] && (normName(r[0]).includes(hn) || hn.includes(normName(r[0]))),
    );
    const value =
      h.funding.kind === "cartao"
        ? "AUTOMÁTICO"
        : h.balanceValue != null
          ? `R$ ${h.balanceValue.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`
          : "?";

    // última alteração REAL na conta (histórico oficial, cobrança diária filtrada)
    const acts = await accountActivities(h.account.act_id, 90, 5);
    const last = acts[0] ?? null;
    const lastDate = last ? brDate(last.at) : "+90d sem alteração";
    const lastWhat = last
      ? `${last.what}${last.object ? ` · ${last.object}` : ""}${last.who && last.who !== "Meta" ? ` — ${last.who}` : ""}`
      : "";

    if (rowIdx < 0) {
      appended.push([h.account.client_name, lastDate, value, lastWhat]);
      matched.push(`${h.account.client_name} (linha nova) → ${value}`);
      continue;
    }
    const row = rowIdx + 1; // A1-notation é 1-based
    updates.push({ range: `${title}!B${row}:D${row}`, values: [[lastDate, value, lastWhat]] });
    matched.push(`${col[rowIdx][0]} → ${value} · últ. alteração ${lastDate}`);
  }

  const ok = await batchUpdateValues(sheetId, updates);
  const okAppend = await appendRows(sheetId, `${title}!A1:D1`, appended);
  return NextResponse.json({ ok: ok && okAppend, sheet: title, updated: matched, unmatched });
}

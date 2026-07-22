import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { allAccountsHealth, type ManagedAccount } from "@/lib/gestor";
import { firstSheetTitle, readRange, batchUpdateValues, appendRows } from "@/lib/google-sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Atualiza a planilha "SALDO CONTAS - CAETANO - OPTIMIZE" (Google Sheets) com a
// leitura do Meta: coluna B = data da checagem, coluna D = saldo pré-pago ou
// AUTOMÁTICO (cartão). Só mexe nas LINHAS cujo cliente bate com uma conta nossa —
// clientes de outros gestores e a coluna Google Ads ficam intocados.

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
  const health = await allAccountsHealth(accounts);

  const title = await firstSheetTitle(sheetId);
  if (!title) return NextResponse.json({ ok: false, error: "não li a planilha (compartilhou com o bot?)" }, { status: 502 });
  const col = await readRange(sheetId, `${title}!A1:A200`);
  if (!col) return NextResponse.json({ ok: false, error: "falha lendo coluna A" }, { status: 502 });

  // data de hoje em Brasília, formato da planilha (dd/mm/aaaa)
  const br = new Date(Date.now() - 3 * 3600 * 1000);
  const today = `${String(br.getUTCDate()).padStart(2, "0")}/${String(br.getUTCMonth() + 1).padStart(2, "0")}/${br.getUTCFullYear()}`;

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
    if (rowIdx < 0) {
      // cliente ainda não tem linha — o bot cria (CLIENTE, DATA, GOOGLE, META)
      appended.push([h.account.client_name, today, "Não Roda", value]);
      matched.push(`${h.account.client_name} (linha nova) → ${value}`);
      continue;
    }
    const row = rowIdx + 1; // A1-notation é 1-based
    updates.push({ range: `${title}!B${row}`, values: [[today]] });
    updates.push({ range: `${title}!D${row}`, values: [[value]] });
    matched.push(`${col[rowIdx][0]} → ${value}`);
  }

  const ok = await batchUpdateValues(sheetId, updates);
  const okAppend = await appendRows(sheetId, `${title}!A1:D1`, appended);
  return NextResponse.json({ ok: ok && okAppend, sheet: title, updated: matched, unmatched });
}

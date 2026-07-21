import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendPushToOrgs } from "@/lib/push";
import { getAccountFinance } from "@/lib/meta-ads";
import { allAccountsHealth, type ManagedAccount } from "@/lib/gestor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // semáforo consulta a Graph API conta a conta

// Resumo diário de notificações (Vercel Cron, 11:00 UTC = 08:00 BRT).
//  (A) SEMÁFORO DA MANHÃ (modo gestor): roda o judge de todas as contas gerenciadas
//      e empurra o resultado — substitui abrir o app pra checar conta a conta.
//  (B) digest do CRM (stand-by, segue vivo): compromissos de hoje, leads esfriando,
//      saldo baixo da conta de anúncios (só Amplia).
// ⚠️ No plano Hobby da Vercel o cron roda 1x/dia — por isso é um digest, não lembrete em tempo real.

const COOLING_HOURS = 3; // lead aguardando resposta há mais que isso = "esfriando"
const SALDO_BAIXO = 50; // R$

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const sb = supabaseAdmin();
  const now = new Date();

  // ── (A) Semáforo da manhã — contas gerenciadas (push pro gestor = org amplia) ──
  let semaforo: { red: number; yellow: number; green: number } | null = null;
  let pushes = 0;
  const { data: accts } = await sb
    .from("managed_accounts")
    .select(
      "id, act_id, client_name, monthly_budget, target_cpa, notes, active, next_action, next_action_at, objective, report_metrics",
    )
    .eq("active", true);
  const accounts = (accts ?? []) as ManagedAccount[];
  if (accounts.length > 0) {
    const health = await allAccountsHealth(accounts); // já vem ordenado por urgência
    const counts = { red: 0, yellow: 0, green: 0 };
    for (const h of health) counts[h.level]++;
    semaforo = counts;

    const attention = health.filter((h) => h.level !== "green");
    const lines = attention
      .slice(0, 4)
      .map((h) => `${h.level === "red" ? "🔴" : "🟡"} ${h.account.client_name} — ${h.reasons[0]}`);
    if (attention.length > 4) lines.push(`…e mais ${attention.length - 4}`);
    if (attention.length === 0) lines.push(`Todas as ${health.length} contas rodando dentro do esperado ✅`);
    const pendentes = accounts.filter((a) => a.next_action).length;
    if (pendentes > 0)
      lines.push(pendentes > 1 ? `📌 ${pendentes} próximas ações anotadas` : "📌 1 próxima ação anotada");

    pushes += await sendPushToOrgs(["amplia"], {
      title: `🚦 Semáforo: ${counts.red} agir · ${counts.yellow} de olho · ${counts.green} ok`,
      body: lines.join("\n"),
      url: "/painel/contas",
      tag: "semaforo",
    });
  }

  // Janela do dia em Brasília (UTC-3): 00:00 BR = 03:00 UTC.
  const br = new Date(now.getTime() - 3 * 3600 * 1000);
  const startUtc = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3, 0, 0));
  const endUtc = new Date(startUtc.getTime() + 24 * 3600 * 1000);
  const coolBefore = new Date(now.getTime() - COOLING_HOURS * 3600 * 1000);

  // (1) compromissos de hoje
  const { data: agendas } = await sb
    .from("leads")
    .select("org_id")
    .gte("scheduled_at", startUtc.toISOString())
    .lt("scheduled_at", endUtc.toISOString())
    .not("stage", "in", "(vendido,perdido)");

  // (2) leads esfriando: última msg foi do lead (aguardando), há mais de X horas, ainda no funil
  const { data: cooling } = await sb
    .from("leads")
    .select("org_id")
    .eq("last_message_dir", "in")
    .lt("last_message_at", coolBefore.toISOString())
    .in("stage", ["novo", "qualificado", "agendado"]);

  // agrega por org
  const byOrg = new Map<string, { agenda: number; cooling: number }>();
  const bump = (org: string, key: "agenda" | "cooling") => {
    const o = byOrg.get(org) ?? { agenda: 0, cooling: 0 };
    o[key]++;
    byOrg.set(org, o);
  };
  for (const r of agendas ?? []) bump((r as { org_id: string }).org_id ?? "amplia", "agenda");
  for (const r of cooling ?? []) bump((r as { org_id: string }).org_id ?? "amplia", "cooling");

  // push por CLIENTE (org != amplia) — só os dados da org dele
  for (const [org, c] of byOrg) {
    if (org === "amplia") continue;
    const parts = digestParts(c.agenda, c.cooling, null);
    if (!parts) continue;
    pushes += await sendPushToOrgs([org], {
      title: "☀️ Resumo do dia",
      body: parts,
      url: "/painel/agenda",
      tag: "digest",
    });
  }

  // (3) saldo baixo (conta de anúncios da Amplia)
  let saldo: number | null = null;
  try {
    const fin = await getAccountFinance();
    saldo = fin?.balanceValue ?? null;
  } catch {
    /* ignora falha da Marketing API */
  }

  // push pra AMPLIA — agrega TUDO (vê todas as orgs) + saldo
  const totAgenda = [...byOrg.values()].reduce((s, c) => s + c.agenda, 0);
  const totCooling = [...byOrg.values()].reduce((s, c) => s + c.cooling, 0);
  const ampliaParts = digestParts(totAgenda, totCooling, saldo);
  if (ampliaParts) {
    pushes += await sendPushToOrgs(["amplia"], {
      title: "☀️ Resumo do dia",
      body: ampliaParts,
      url: "/painel/agenda",
      tag: "digest",
    });
  }

  return NextResponse.json({
    ok: true,
    semaforo,
    agenda: totAgenda,
    cooling: totCooling,
    saldo,
    saldoBaixo: saldo != null && saldo < SALDO_BAIXO,
    pushes,
  });
}

// Monta o corpo do resumo; retorna null se não há nada que valha notificar.
function digestParts(agenda: number, cooling: number, saldo: number | null): string | null {
  const parts: string[] = [];
  if (agenda > 0) parts.push(`📅 ${agenda} compromisso${agenda > 1 ? "s" : ""} hoje`);
  if (cooling > 0) parts.push(`⏳ ${cooling} lead${cooling > 1 ? "s" : ""} aguardando resposta`);
  if (saldo != null && saldo < SALDO_BAIXO) parts.push(`⚠️ saldo baixo: R$ ${saldo.toFixed(2).replace(".", ",")}`);
  return parts.length ? parts.join(" · ") : null;
}

import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendPushToOrgs } from "@/lib/push";
import { getAccountFinance } from "@/lib/meta-ads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resumo diário de notificações (Vercel Cron). Junta 3 gatilhos num push só por org:
//  (1) compromissos de HOJE, (2) leads esfriando (aguardando resposta há horas),
//  (3) saldo baixo da conta de anúncios (só Amplia).
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

  let pushes = 0;

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

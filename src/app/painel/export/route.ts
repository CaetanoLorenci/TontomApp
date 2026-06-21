import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Export CSV das conversas do período (espelho do TinTim, abre no Excel/Sheets).
// /painel/export?p=hoje|7d|30d|tudo
const DAYS: Record<string, number | null> = { hoje: 0, "7d": 7, "30d": 30, tudo: null };

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p") ?? "30d";
  const days = p in DAYS ? DAYS[p] : 30;

  const { org, seesAll } = await getScope();
  let query = supabaseAdmin()
    .from("leads")
    .select(
      "phone, name, stage, value, code, first_message, created_at, clicks(utm_source, utm_medium, utm_campaign, utm_content, fbclid)",
    )
    .order("created_at", { ascending: false });
  if (!seesAll) query = query.eq("org_id", org);

  if (days !== null) {
    const d = new Date();
    if (days === 0) d.setHours(0, 0, 0, 0);
    else d.setDate(d.getDate() - days);
    query = query.gte("created_at", d.toISOString());
  }

  const { data, error } = await query;
  if (error) return new NextResponse(`Erro: ${error.message}`, { status: 500 });

  type Row = {
    phone: string; name: string | null; stage: string; value: number | null;
    code: string | null; first_message: string | null; created_at: string;
    clicks: { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; fbclid: string | null } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const header = [
    "data", "nome", "telefone", "estagio", "valor",
    "campanha", "conjunto/medium", "anuncio/content", "source", "codigo", "fbclid", "primeira_mensagem",
  ];
  const lines = rows.map((r) =>
    [
      new Date(r.created_at).toLocaleString("pt-BR"),
      r.name, r.phone, r.stage, r.value,
      r.clicks?.utm_campaign, r.clicks?.utm_medium, r.clicks?.utm_content,
      r.clicks?.utm_source, r.code, r.clicks?.fbclid, r.first_message,
    ].map(csvCell).join(";"),
  );

  // BOM pra acentos abrirem certos no Excel; ; como separador (padrão BR).
  const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="amplia-hub-conversas-${p}.csv"`,
    },
  });
}

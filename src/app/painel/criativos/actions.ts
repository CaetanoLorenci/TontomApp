"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope, getSessionUser } from "@/lib/auth";
import { sendPushToOrgs } from "@/lib/push";

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/* Equipe adiciona um criativo para um cliente (org). */
export async function createCriativo(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) throw new Error("Sem permissão.");

  const org_id = String(formData.get("org_id") || "").trim();
  const titulo = String(formData.get("titulo") || "").trim();
  if (!org_id || !titulo) throw new Error("Cliente e título são obrigatórios.");

  await supabaseAdmin().from("criativos").insert({
    org_id,
    titulo,
    tipo: String(formData.get("tipo") || "").trim() || null,
    descricao: String(formData.get("descricao") || "").trim() || null,
    arquivo_url: String(formData.get("arquivo_url") || "").trim() || null,
  });
  revalidatePath("/painel/criativos");
}

/* Resolve org alvo + checa permissão sobre o criativo. */
async function guardCriativo(id: string) {
  const { org, seesAll } = await getScope();
  const sb = supabaseAdmin();
  const { data: cr } = await sb.from("criativos").select("id, org_id, titulo").eq("id", id).maybeSingle();
  if (!cr) throw new Error("Criativo não encontrado.");
  const row = cr as { id: string; org_id: string; titulo: string };
  if (!seesAll && row.org_id !== org) throw new Error("Sem permissão.");
  return { sb, cr: row, seesAll };
}

export async function aprovarCriativo(formData: FormData) {
  const id = String(formData.get("id") || "");
  const { sb, cr, seesAll } = await guardCriativo(id);
  const user = await getSessionUser();
  await sb.from("criativos").update({
    status_aprovacao: "aprovado",
    motivo_reprovacao: null,
    avaliado_em: new Date().toISOString(),
    avaliado_por: user?.id ?? null,
  }).eq("id", id);
  // cliente aprovou → avisa a Amplia
  if (!seesAll) {
    await sendPushToOrgs(["amplia"], {
      title: "✅ Criativo aprovado",
      body: `${cr.org_id}: "${cr.titulo}"`,
      url: "/painel/criativos",
      tag: `criativo-${id}`,
    });
  }
  revalidatePath("/painel/criativos");
}

export async function reprovarCriativo(formData: FormData) {
  const id = String(formData.get("id") || "");
  const motivo = String(formData.get("motivo") || "").trim();
  if (countWords(motivo) < 25) {
    throw new Error("O motivo da reprovação precisa ter ao menos 25 palavras.");
  }
  const { sb, cr, seesAll } = await guardCriativo(id);
  const user = await getSessionUser();
  await sb.from("criativos").update({
    status_aprovacao: "reprovado",
    motivo_reprovacao: motivo,
    avaliado_em: new Date().toISOString(),
    avaliado_por: user?.id ?? null,
  }).eq("id", id);
  // cliente reprovou → avisa a Amplia (com início do motivo)
  if (!seesAll) {
    await sendPushToOrgs(["amplia"], {
      title: "❌ Criativo reprovado",
      body: `${cr.org_id}: "${cr.titulo}" — ${motivo.length > 60 ? motivo.slice(0, 60) + "…" : motivo}`,
      url: "/painel/criativos",
      tag: `criativo-${id}`,
    });
  }
  revalidatePath("/painel/criativos");
}

export async function deleteCriativo(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) throw new Error("Sem permissão.");
  const id = String(formData.get("id") || "");
  await supabaseAdmin().from("criativos").delete().eq("id", id);
  revalidatePath("/painel/criativos");
}

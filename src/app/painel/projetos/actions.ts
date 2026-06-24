"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";

export async function createProjeto(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) throw new Error("Sem permissão.");
  const org_id = String(formData.get("org_id") || "").trim();
  const nome = String(formData.get("nome") || "").trim();
  if (!org_id || !nome) throw new Error("Cliente e nome são obrigatórios.");
  await supabaseAdmin().from("projetos").insert({
    org_id,
    nome,
    tipo: String(formData.get("tipo") || "").trim() || null,
    prazo: String(formData.get("prazo") || "").trim() || null,
  });
  revalidatePath("/painel/projetos");
}

export async function updateProjeto(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) throw new Error("Sem permissão.");
  const id = String(formData.get("id") || "");
  await supabaseAdmin().from("projetos").update({
    nome: String(formData.get("nome") || "").trim(),
    status: String(formData.get("status") || "andamento"),
    tipo: String(formData.get("tipo") || "").trim() || null,
    prioridade: String(formData.get("prioridade") || "").trim() || null,
    prazo: String(formData.get("prazo") || "").trim() || null,
    descricao: String(formData.get("descricao") || "").trim() || null,
    report: String(formData.get("report") || "").trim() || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  revalidatePath(`/painel/projetos/${id}`);
  revalidatePath("/painel/projetos");
}

export async function deleteProjeto(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) throw new Error("Sem permissão.");
  const id = String(formData.get("id") || "");
  await supabaseAdmin().from("projetos").delete().eq("id", id);
  revalidatePath("/painel/projetos");
  redirect("/painel/projetos");
}

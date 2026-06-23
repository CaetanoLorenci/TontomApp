"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";

const clean = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

export async function updateOrgProfile(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) throw new Error("Sem permissão.");
  const slug = String(formData.get("slug") || "");
  await supabaseAdmin().from("organizations").update({
    name: String(formData.get("name") || "").trim() || slug,
    segmento: clean(formData.get("segmento")),
    contato_principal: clean(formData.get("contato_principal")),
    contato_email: clean(formData.get("contato_email")),
    site: clean(formData.get("site")),
    brand_color: clean(formData.get("brand_color")),
    logo_url: clean(formData.get("logo_url")),
    escopo_midia: clean(formData.get("escopo_midia")),
    observacoes: clean(formData.get("observacoes")),
    historico: clean(formData.get("historico")),
    tipografia: clean(formData.get("tipografia")),
    tom_voz: clean(formData.get("tom_voz")),
  }).eq("slug", slug);
  revalidatePath(`/painel/clientes/${slug}`);
}

export async function addEntregavel(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) throw new Error("Sem permissão.");
  const org_id = String(formData.get("org_id") || "");
  const tipo = String(formData.get("tipo") || "").trim();
  if (!org_id || !tipo) throw new Error("Tipo é obrigatório.");
  await supabaseAdmin().from("entregaveis").insert({
    org_id,
    tipo,
    frequencia: clean(formData.get("frequencia")),
    volume: clean(formData.get("volume")),
    descricao: clean(formData.get("descricao")),
  });
  revalidatePath(`/painel/clientes/${org_id}`);
}

export async function deleteEntregavel(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) throw new Error("Sem permissão.");
  const id = String(formData.get("id") || "");
  const org_id = String(formData.get("org_id") || "");
  await supabaseAdmin().from("entregaveis").delete().eq("id", id);
  revalidatePath(`/painel/clientes/${org_id}`);
}

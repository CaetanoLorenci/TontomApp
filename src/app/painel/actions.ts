"use server";

import { revalidatePath } from "next/cache";
import { advanceStage } from "@/lib/conversion";
import { supabaseAdmin } from "@/lib/supabase";
import { sendCloudText } from "@/lib/cloud-whatsapp";
import { brLocalToIso } from "@/lib/format";
import { getScope } from "@/lib/auth";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function revalidateLead(leadId: string) {
  revalidatePath("/painel");
  revalidatePath("/painel/agenda");
  revalidatePath(`/painel/lead/${leadId}`);
}

// Responde o lead pelo WhatsApp oficial (Cloud API), direto do painel.
// Válido dentro da janela de 24h (lead mandou) / 72h (CTWA). Fora disso, exige template.
export async function replyToLead(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!leadId || !text) return;

  const sb = supabaseAdmin();
  const { data: lead } = await sb.from("leads").select("phone").eq("id", leadId).maybeSingle();
  if (!lead?.phone) return;

  try {
    const res = await sendCloudText(lead.phone, text);
    if (res.ok) {
      await sb.from("messages").insert({ lead_id: leadId, phone: lead.phone, direction: "out", content: text });
    } else {
      console.error("[reply] envio Cloud API falhou:", JSON.stringify(res.body));
    }
  } catch (e) {
    console.error("[reply] erro:", e);
  }
  revalidatePath(`/painel/lead/${leadId}`);
}

// Atualiza estágio/valor de um lead e, se for o caso, dispara o evento pro Meta (CAPI).
export async function updateLead(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const stage = String(formData.get("stage") ?? "");
  const rawValue = String(formData.get("value") ?? "").replace(/\./g, "").replace(",", ".");
  const value = rawValue ? Number(rawValue) : null;
  const scheduledRaw = String(formData.get("scheduledAt") ?? "").trim();
  if (!leadId || !stage) return;

  // humano pode corrigir pra qualquer estágio (onlyForward: false)
  await advanceStage(leadId, stage, Number.isFinite(value as number) ? value : null, {
    onlyForward: false,
    source: "painel",
  });

  // ao agendar, se veio data/hora junto, grava no lead
  if (stage === "agendado" && scheduledRaw) {
    const iso = brLocalToIso(scheduledRaw);
    if (iso) {
      await supabaseAdmin()
        .from("leads")
        .update({ scheduled_at: iso, updated_at: new Date().toISOString() })
        .eq("id", leadId);
    }
  }

  revalidateLead(leadId);
}

// ── Multi-cliente: onboarding + roteamento (só Amplia) ──────
export async function createOrg(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) return;
  const name = String(formData.get("name") ?? "").trim();
  const mode = String(formData.get("mode") ?? "rastreio");
  if (!name) return;
  const slug = slugify(name) || `cliente-${Date.now()}`;
  await supabaseAdmin()
    .from("organizations")
    .insert({ slug, name, mode: ["rastreio", "site", "completo"].includes(mode) ? mode : "rastreio" });
  revalidatePath("/painel/clientes");
}

export async function inviteToOrg(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) return;
  const orgSlug = String(formData.get("orgSlug") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!orgSlug || !email) return;
  const sb = supabaseAdmin();
  const base = process.env.APP_BASE_URL || "https://tontom-app.vercel.app";
  const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${base}/auth/callback`,
  });
  if (error || !data?.user) {
    console.error("[invite] falhou:", error?.message);
    return;
  }
  await sb.from("org_members").insert({ org_slug: orgSlug, user_id: data.user.id, role: "member" });
  revalidatePath("/painel/clientes");
}

// Atribui um lead (e seus dados) a uma org de cliente — roteamento manual.
export async function setLeadOrg(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) return;
  const leadId = String(formData.get("leadId") ?? "");
  const orgSlug = String(formData.get("orgSlug") ?? "").trim();
  if (!leadId || !orgSlug) return;
  const sb = supabaseAdmin();
  const { data: lead } = await sb.from("leads").select("click_id").eq("id", leadId).maybeSingle();
  await sb.from("leads").update({ org_id: orgSlug }).eq("id", leadId);
  await sb.from("messages").update({ org_id: orgSlug }).eq("lead_id", leadId);
  await sb.from("capi_events").update({ org_id: orgSlug }).eq("lead_id", leadId);
  if (lead?.click_id) await sb.from("clicks").update({ org_id: orgSlug }).eq("id", lead.click_id);
  revalidateLead(leadId);
}

// ── Ficha do contato (CRM) ──────────────────────────────────
export async function addNote(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!leadId || !body) return;
  await supabaseAdmin().from("lead_notes").insert({ lead_id: leadId, body });
  revalidatePath(`/painel/lead/${leadId}`);
}

export async function addTag(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const tag = String(formData.get("tag") ?? "").trim().toLowerCase().slice(0, 30);
  if (!leadId || !tag) return;
  const sb = supabaseAdmin();
  const { data: lead } = await sb.from("leads").select("tags").eq("id", leadId).maybeSingle();
  const tags = new Set<string>((lead?.tags as string[] | null) ?? []);
  tags.add(tag);
  await sb.from("leads").update({ tags: [...tags] }).eq("id", leadId);
  revalidatePath(`/painel/lead/${leadId}`);
}

export async function removeTag(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const tag = String(formData.get("tag") ?? "");
  if (!leadId || !tag) return;
  const sb = supabaseAdmin();
  const { data: lead } = await sb.from("leads").select("tags").eq("id", leadId).maybeSingle();
  const tags = ((lead?.tags as string[] | null) ?? []).filter((t) => t !== tag);
  await sb.from("leads").update({ tags }).eq("id", leadId);
  revalidatePath(`/painel/lead/${leadId}`);
}

// Move um lead de estágio (arrastar no Kanban). Humano pode mover em qualquer direção.
// value: usado ao mover pra "vendido" → o Purchase já sai COM o valor (ROI no Meta).
export async function moveLeadStage(leadId: string, stage: string, value?: number | null) {
  if (!leadId || !stage) return;
  await advanceStage(leadId, stage, value ?? null, { onlyForward: false, source: "painel" });
  revalidateLead(leadId);
}

// Define/reagenda a data-hora de um lead (mini-CRM). Garante estágio 'agendado'
// se ainda estiver antes dele (dispara CAPI uma vez); não rebaixa vendido/perdido.
export async function scheduleLead(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const scheduledRaw = String(formData.get("scheduledAt") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!leadId || !scheduledRaw) return;
  const iso = brLocalToIso(scheduledRaw);
  if (!iso) return;

  const sb = supabaseAdmin();
  const { data: lead } = await sb.from("leads").select("stage").eq("id", leadId).maybeSingle();
  if (!lead) return;

  // só avança pra agendado se ainda não chegou lá (não regride venda/perda nem reenvia CAPI)
  if (lead.stage === "novo" || lead.stage === "qualificado") {
    await advanceStage(leadId, "agendado", null, { onlyForward: true, source: "painel" });
  }
  await sb
    .from("leads")
    .update({ scheduled_at: iso, scheduled_note: note, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  revalidateLead(leadId);
}

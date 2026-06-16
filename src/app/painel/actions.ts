"use server";

import { revalidatePath } from "next/cache";
import { advanceStage } from "@/lib/conversion";
import { supabaseAdmin } from "@/lib/supabase";
import { sendCloudText } from "@/lib/cloud-whatsapp";

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
  if (!leadId || !stage) return;

  // humano pode corrigir pra qualquer estágio (onlyForward: false)
  await advanceStage(leadId, stage, Number.isFinite(value as number) ? value : null, {
    onlyForward: false,
    source: "painel",
  });

  revalidatePath("/painel");
  revalidatePath(`/painel/lead/${leadId}`);
}

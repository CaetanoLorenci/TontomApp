"use server";

import { revalidatePath } from "next/cache";
import { advanceStage } from "@/lib/conversion";

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

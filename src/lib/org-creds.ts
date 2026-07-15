import { supabaseAdmin } from "@/lib/supabase";

// Credencial de WhatsApp/CAPI POR ORG — destrava cliente rodando na PRÓPRIA WABA
// (ex.: Soul Move, franquias). Campos nulos na org = usa a infra da Amplia (envs).
// Um lugar só resolve o fallback, pra nenhum caller esquecer.

export type OrgWaCreds = {
  token: string | null; // Cloud API access token (system user do dono da WABA)
  phoneId: string | null; // phone_number_id de envio
  wabaId: string | null; // WABA dona do número (CAPI casa por ela)
  datasetId: string | null; // dataset de mensagens (CAPI business_messaging)
};

const envCreds = (): OrgWaCreds => ({
  token: process.env.WHATSAPP_ACCESS_TOKEN || null,
  phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
  wabaId: process.env.WHATSAPP_WABA_ID || null,
  datasetId: process.env.META_CTWA_DATASET_ID || null,
});

// orgSlug null/'amplia' ou org sem credencial própria → infra da Amplia.
export async function orgWaCreds(orgSlug: string | null | undefined): Promise<OrgWaCreds> {
  const base = envCreds();
  if (!orgSlug || orgSlug === "amplia") return base;
  const { data: org } = await supabaseAdmin()
    .from("organizations")
    .select("wa_phone_number_id, waba_id, wa_access_token, ctwa_dataset_id")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (!org) return base;
  return {
    // phoneId da org vale mesmo sob a WABA da Amplia (multi-número já existente)
    phoneId: (org.wa_phone_number_id as string | null) || base.phoneId,
    // token/WABA/dataset só mudam JUNTOS (WABA própria); parcial cai no da Amplia
    token: (org.wa_access_token as string | null) || base.token,
    wabaId: (org.waba_id as string | null) || base.wabaId,
    datasetId: (org.ctwa_dataset_id as string | null) || base.datasetId,
  };
}

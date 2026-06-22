"use server";

import { revalidatePath } from "next/cache";
import { advanceStage } from "@/lib/conversion";
import { supabaseAdmin } from "@/lib/supabase";
import { sendCloudText } from "@/lib/cloud-whatsapp";
import { brLocalToIso } from "@/lib/format";
import { getScope, getSessionUser } from "@/lib/auth";
import { sendPushToOrgs } from "@/lib/push";

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

export type ReplyResult = { ok: boolean; error?: string };

// Traduz o erro da Cloud API pra algo acionável pro time.
function friendlyCloudError(body: unknown): string {
  const err = (body as { error?: { code?: number; message?: string; error_data?: { details?: string } } })?.error;
  const code = err?.code;
  const msg = err?.message ?? "";
  if (code === 131047 || /24 hours|reengagement|re-engagement/i.test(msg)) {
    return "Fora da janela de 24h: o lead precisa te mandar uma mensagem antes de você responder em texto livre (ou use um template aprovado).";
  }
  if (code === 190 || /access token|expired|OAuth/i.test(msg)) {
    return "Token do WhatsApp inválido/expirado — precisa reconectar o número.";
  }
  if (code === 131026 || /not.*opted in|undeliverable/i.test(msg)) {
    return "Mensagem não pôde ser entregue (número não disponível no WhatsApp ou não optou por receber).";
  }
  return err?.error_data?.details || msg || "Não foi possível enviar pelo WhatsApp.";
}

// Responde o lead pelo WhatsApp oficial (Cloud API), direto do painel.
// Válido dentro da janela de 24h (lead mandou) / 72h (CTWA). Fora disso, exige template.
// Retorna {ok,error} pra UI mostrar a falha (antes era silencioso).
export async function replyToLead(formData: FormData): Promise<ReplyResult> {
  const leadId = String(formData.get("leadId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!leadId || !text) return { ok: false, error: "Mensagem vazia." };

  const sb = supabaseAdmin();
  const { data: lead } = await sb.from("leads").select("phone").eq("id", leadId).maybeSingle();
  if (!lead?.phone) return { ok: false, error: "Lead sem telefone registrado." };

  try {
    const res = await sendCloudText(lead.phone, text);
    if (res.ok) {
      await sb.from("messages").insert({ lead_id: leadId, phone: lead.phone, direction: "out", content: text });
      revalidatePath(`/painel/lead/${leadId}`);
      return { ok: true };
    }
    console.error("[reply] envio Cloud API falhou:", JSON.stringify(res.body));
    return { ok: false, error: friendlyCloudError(res.body) };
  } catch (e) {
    console.error("[reply] erro:", e);
    const m = e instanceof Error ? e.message : "";
    if (/WHATSAPP_PHONE_NUMBER_ID|WHATSAPP_ACCESS_TOKEN/.test(m)) {
      return { ok: false, error: "Configuração do WhatsApp ausente no servidor (token/phone id)." };
    }
    return { ok: false, error: "Erro de rede ao falar com o WhatsApp. Tente de novo." };
  }
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

// Acha um usuário do Auth pelo e-mail (não há getUserByEmail; paginamos o listUsers).
async function findAuthUserByEmail(email: string) {
  const sb = supabaseAdmin();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) break; // última página
  }
  return null;
}

// Define/redefine a senha de acesso de um usuário (só Amplia). Sem e-mail/SMTP:
// cria o usuário já confirmado se não existir, e opcionalmente vincula a uma org de cliente.
// É assim que a Amplia provisiona acesso (próprio e de clientes) sem depender de e-mail.
export async function setAccessPassword(
  _prev: { ok: boolean; msg: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; msg: string }> {
  const { seesAll } = await getScope();
  if (!seesAll) return { ok: false, msg: "Sem permissão." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const orgSlug = String(formData.get("orgSlug") ?? "").trim();
  if (!email || !email.includes("@")) return { ok: false, msg: "E-mail inválido." };
  if (password.length < 8) return { ok: false, msg: "A senha precisa ter ao menos 8 caracteres." };

  const sb = supabaseAdmin();
  let userId: string;
  let criado = false;

  const existing = await findAuthUserByEmail(email);
  if (existing) {
    const { error } = await sb.auth.admin.updateUserById(existing.id, { password });
    if (error) return { ok: false, msg: `Erro ao atualizar: ${error.message}` };
    userId = existing.id;
  } else {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data?.user) return { ok: false, msg: `Erro ao criar: ${error?.message ?? "desconhecido"}` };
    userId = data.user.id;
    criado = true;
  }

  // vincula à org (cliente) se pedido e ainda não vinculado
  if (orgSlug) {
    const { data: m } = await sb.from("org_members").select("user_id").eq("user_id", userId).maybeSingle();
    if (!m) await sb.from("org_members").insert({ org_slug: orgSlug, user_id: userId, role: "member" });
  }

  revalidatePath("/painel/acesso");
  revalidatePath("/painel/clientes");
  return {
    ok: true,
    msg: `${criado ? "Acesso criado" : "Senha atualizada"} para ${email}${orgSlug ? ` (cliente: ${orgSlug})` : ""}.`,
  };
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

// ── Notificações push ───────────────────────────────────────
type WebPushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

// Salva a inscrição de push do dispositivo atual, vinculada à org de quem está logado.
export async function savePushSubscription(sub: WebPushSub, userAgent?: string): Promise<{ ok: boolean }> {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false };
  const scope = await getScope();
  const u = await getSessionUser();
  await supabaseAdmin()
    .from("push_subscriptions")
    .upsert(
      {
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        org_id: scope.org,
        user_id: u?.id ?? null,
        user_agent: userAgent?.slice(0, 300) ?? null,
      },
      { onConflict: "endpoint" },
    );
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  if (!endpoint) return { ok: false };
  await supabaseAdmin().from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

// Dispara um push de teste pros dispositivos da org de quem está logado.
export async function sendTestPush(): Promise<{ ok: boolean; sent: number }> {
  const scope = await getScope();
  const sent = await sendPushToOrgs([scope.org], {
    title: "Amplia Hub",
    body: "🔔 Notificações ativadas! É assim que você vai saber de leads novos.",
    url: "/painel",
    tag: "teste",
  });
  return { ok: sent > 0, sent };
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

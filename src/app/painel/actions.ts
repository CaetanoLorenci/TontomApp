"use server";

import { revalidatePath } from "next/cache";
import { advanceStage } from "@/lib/conversion";
import { supabaseAdmin } from "@/lib/supabase";
import { sendCloudText } from "@/lib/cloud-whatsapp";
import { orgWaCreds } from "@/lib/org-creds";
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

// Fronteira de escrita multi-tenant: confirma que o lead pertence ao escopo de quem chamou.
// Amplia (seesAll) age em qualquer lead; cliente só nos da própria org. Bloqueia POST forjado
// com leadId de outra org. Sem sessão (Basic Auth de transição) = Amplia.
async function leadInScope(leadId: string): Promise<boolean> {
  const scope = await getScope();
  if (scope.seesAll) return true;
  const { data } = await supabaseAdmin().from("leads").select("org_id").eq("id", leadId).maybeSingle();
  return !!data && (data.org_id ?? "amplia") === scope.org;
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
  if (!(await leadInScope(leadId))) return { ok: false, error: "Sem permissão." };

  const sb = supabaseAdmin();
  const { data: lead } = await sb.from("leads").select("phone, org_id").eq("id", leadId).maybeSingle();
  if (!lead?.phone) return { ok: false, error: "Lead sem telefone registrado." };

  // multi-número: responde A PARTIR do número da org do lead (cada cliente tem o seu),
  // com o token da WABA dona do número (org com WABA própria usa o token dela).
  // Org sem credencial → número/token padrão da Amplia (env). Ver lib/org-creds.
  const creds = await orgWaCreds(lead.org_id as string | null);

  try {
    const res = await sendCloudText(lead.phone, text, creds.phoneId, creds.token);
    if (res.ok) {
      const wamid = (res.body as { messages?: { id?: string }[] })?.messages?.[0]?.id ?? null;
      await sb.from("messages").insert({
        lead_id: leadId,
        phone: lead.phone,
        direction: "out",
        content: text,
        zapi_message_id: wamid, // p/ casar com os recibos (entregue/lido) do webhook
        status: "sent",
        status_at: new Date().toISOString(),
      });
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
  if (!(await leadInScope(leadId))) return;

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

// Mapeia uma CONTA de anúncio a um cliente → leads desse anúncio caem sozinhos na org.
// Aceita "act_123" ou "123" (normaliza pra dígitos, que é como a Graph devolve account_id).
export async function addAdRoute(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) return;
  const orgSlug = String(formData.get("orgSlug") ?? "").trim();
  const value = String(formData.get("account") ?? "").replace(/[^0-9]/g, "");
  if (!orgSlug || !value) return;
  await supabaseAdmin()
    .from("ad_routes")
    .upsert(
      { match_type: "account", match_value: value, org_slug: orgSlug, label: `Conta act_${value}` },
      { onConflict: "match_type,match_value" },
    );
  revalidatePath("/painel/clientes");
}

export async function removeAdRoute(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabaseAdmin().from("ad_routes").delete().eq("id", id);
  revalidatePath("/painel/clientes");
}

// Define (ou limpa) o número de WhatsApp próprio do cliente (Cloud API phone_number_id).
// Lead que chega nesse número cai na org dele; respostas saem desse número. Vazio = limpa.
export async function setOrgNumber(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) return;
  const orgSlug = String(formData.get("orgSlug") ?? "").trim();
  const value = String(formData.get("phoneId") ?? "").replace(/[^0-9]/g, "") || null;
  if (!orgSlug) return;
  await supabaseAdmin().from("organizations").update({ wa_phone_number_id: value }).eq("slug", orgSlug);
  revalidatePath("/painel/clientes");
}

// Define a WABA PRÓPRIA do cliente (waba_id + dataset + token do system user dele).
// Tudo nulo = cliente roda na infra da Amplia (comportamento padrão).
// Token: campo vazio MANTÉM o atual (não reexibimos segredo na UI); "limpar" apaga.
export async function setOrgWaba(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) return;
  const orgSlug = String(formData.get("orgSlug") ?? "").trim();
  if (!orgSlug) return;
  const wabaId = String(formData.get("wabaId") ?? "").replace(/[^0-9]/g, "") || null;
  const datasetId = String(formData.get("datasetId") ?? "").replace(/[^0-9]/g, "") || null;
  const tokenRaw = String(formData.get("token") ?? "").trim();
  const patch: Record<string, string | null> = { waba_id: wabaId, ctwa_dataset_id: datasetId };
  if (tokenRaw === "limpar") patch.wa_access_token = null;
  else if (tokenRaw) patch.wa_access_token = tokenRaw;
  await supabaseAdmin().from("organizations").update(patch).eq("slug", orgSlug);
  revalidatePath("/painel/clientes");
}

// ── Hub Gestor: contas de anúncio gerenciadas (só Amplia) ──
export async function addManagedAccount(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) return;
  const actId = String(formData.get("actId") ?? "").replace(/[^0-9]/g, "");
  const clientName = String(formData.get("clientName") ?? "").trim();
  if (!actId || !clientName) return;
  const budgetRaw = String(formData.get("budget") ?? "").replace(/\./g, "").replace(",", ".");
  const targetRaw = String(formData.get("targetCpa") ?? "").replace(/\./g, "").replace(",", ".");
  const budget = budgetRaw ? Number(budgetRaw) : null;
  const target = targetRaw ? Number(targetRaw) : null;
  await supabaseAdmin().from("managed_accounts").upsert(
    {
      act_id: actId,
      client_name: clientName,
      monthly_budget: Number.isFinite(budget as number) ? budget : null,
      target_cpa: Number.isFinite(target as number) ? target : null,
      active: true,
    },
    { onConflict: "act_id" },
  );
  revalidatePath("/painel/contas");
}

export async function removeManagedAccount(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // desativa (não apaga) — preserva histórico/nota se a conta voltar
  await supabaseAdmin().from("managed_accounts").update({ active: false }).eq("id", id);
  revalidatePath("/painel/contas");
}

// Define a "próxima ação" de uma conta (mini-tarefa visível no semáforo).
export async function setAccountAction(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) return;
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "").trim().slice(0, 120);
  if (!id || !action) return;
  await supabaseAdmin()
    .from("managed_accounts")
    .update({ next_action: action, next_action_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/painel/contas");
}

// Ajustes da conta na página de detalhe: verba, custo-alvo e notas.
export async function updateAccountSettings(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const budgetRaw = String(formData.get("budget") ?? "").replace(/\./g, "").replace(",", ".");
  const targetRaw = String(formData.get("targetCpa") ?? "").replace(/\./g, "").replace(",", ".");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
  const budget = budgetRaw ? Number(budgetRaw) : null;
  const target = targetRaw ? Number(targetRaw) : null;
  await supabaseAdmin()
    .from("managed_accounts")
    .update({
      monthly_budget: Number.isFinite(budget as number) ? budget : null,
      target_cpa: Number.isFinite(target as number) ? target : null,
      notes,
    })
    .eq("id", id);
  revalidatePath("/painel/contas");
  revalidatePath(`/painel/contas/${id}`);
}

// Marca a próxima ação como feita (limpa).
export async function clearAccountAction(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabaseAdmin()
    .from("managed_accounts")
    .update({ next_action: null, next_action_at: null })
    .eq("id", id);
  revalidatePath("/painel/contas");
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

// ── Central do Cliente: pedidos / sugestões ─────────────────
const REQUEST_KINDS = ["geral", "anuncio", "app"] as const;
const KIND_LABEL: Record<string, string> = {
  geral: "Geral",
  anuncio: "Pedido de anúncio",
  app: "Feedback do app",
};

// Cliente (ou Amplia) cria um pedido/sugestão na org dele. Notifica a Amplia por push.
export async function createClientRequest(
  _prev: { ok: boolean; msg: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; msg: string }> {
  const scope = await getScope();
  const u = await getSessionUser();
  const body = String(formData.get("body") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "geral");
  const kind = (REQUEST_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "geral";
  if (!body) return { ok: false, msg: "Escreva sua mensagem." };

  const { error } = await supabaseAdmin().from("client_requests").insert({
    org_id: scope.org,
    kind,
    body: body.slice(0, 2000),
    created_by: u?.id ?? null,
  });
  if (error) return { ok: false, msg: "Não foi possível enviar. Tente de novo." };

  // avisa a Amplia (só quando o autor é um cliente, não a própria Amplia)
  if (scope.org !== "amplia") {
    await sendPushToOrgs(["amplia"], {
      title: `📥 ${KIND_LABEL[kind]} · ${scope.org}`,
      body: body.length > 80 ? body.slice(0, 80) + "…" : body,
      url: "/painel/central",
      tag: "pedido",
    });
  }
  revalidatePath("/painel/central");
  return { ok: true, msg: "Enviado! A Amplia vai ver por aqui." };
}

// Gera uma URL assinada pra subir UM arquivo direto pro Storage (bypassa o limite
// de body das server actions → aguenta vídeo). O cliente faz uploadToSignedUrl com o token.
export async function createUploadUrl(
  filename: string,
  _mime: string,
): Promise<{ ok: boolean; path?: string; token?: string; error?: string }> {
  const scope = await getScope();
  const safe = (filename || "arquivo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const path = `${scope.org}/${crypto.randomUUID()}-${safe}`;
  const { data, error } = await supabaseAdmin().storage.from("client-uploads").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao preparar upload." };
  return { ok: true, path: data.path, token: data.token };
}

// Cria um pedido COM arquivos já enviados (criativos). Usado pelo composer da Central.
export async function createRequestRich(input: {
  kind: string;
  body: string;
  files: { path: string; name?: string; mime?: string }[];
}): Promise<{ ok: boolean; msg: string }> {
  const scope = await getScope();
  const u = await getSessionUser();
  const body = (input.body ?? "").trim();
  const kind = (REQUEST_KINDS as readonly string[]).includes(input.kind) ? input.kind : "geral";
  const files = (input.files ?? []).slice(0, 20);
  if (!body && files.length === 0) return { ok: false, msg: "Escreva algo ou anexe um arquivo." };

  const sb = supabaseAdmin();
  const { data: req, error } = await sb
    .from("client_requests")
    .insert({ org_id: scope.org, kind, body: (body || "(criativos anexados)").slice(0, 2000), created_by: u?.id ?? null })
    .select("id")
    .single();
  if (error || !req) return { ok: false, msg: "Não foi possível enviar. Tente de novo." };

  if (files.length) {
    await sb.from("request_files").insert(
      files.map((f) => ({
        request_id: req.id,
        org_id: scope.org,
        path: f.path,
        name: f.name?.slice(0, 200) ?? null,
        mime: f.mime ?? null,
      })),
    );
  }

  if (scope.org !== "amplia") {
    await sendPushToOrgs(["amplia"], {
      title: `📥 ${KIND_LABEL[kind]} · ${scope.org}`,
      body: (body || `${files.length} criativo(s) enviado(s)`).slice(0, 80),
      url: "/painel/central",
      tag: "pedido",
    });
  }
  revalidatePath("/painel/central");
  return { ok: true, msg: "Enviado! A Amplia vai ver por aqui." };
}

// Amplia muda o status de um pedido e notifica o cliente.
export async function setRequestStatus(formData: FormData) {
  const { seesAll } = await getScope();
  if (!seesAll) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["aberto", "andamento", "feito"].includes(status)) return;

  const sb = supabaseAdmin();
  const { data: reqRow } = await sb.from("client_requests").select("org_id").eq("id", id).maybeSingle();
  await sb
    .from("client_requests")
    .update({ status, resolved_at: status === "feito" ? new Date().toISOString() : null })
    .eq("id", id);

  const org = (reqRow as { org_id?: string } | null)?.org_id;
  if (org && org !== "amplia") {
    const label = status === "feito" ? "concluído ✅" : status === "andamento" ? "em andamento 🛠️" : "reaberto";
    await sendPushToOrgs([org], {
      title: "Atualização do seu pedido",
      body: `Seu pedido está ${label}.`,
      url: "/painel/central",
      tag: "pedido-status",
    });
  }
  revalidatePath("/painel/central");
}

// ── Ficha do contato (CRM) ──────────────────────────────────
export async function addNote(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!leadId || !body) return;
  if (!(await leadInScope(leadId))) return;
  await supabaseAdmin().from("lead_notes").insert({ lead_id: leadId, body });
  revalidatePath(`/painel/lead/${leadId}`);
}

export async function addTag(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const tag = String(formData.get("tag") ?? "").trim().toLowerCase().slice(0, 30);
  if (!leadId || !tag) return;
  if (!(await leadInScope(leadId))) return;
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
  if (!(await leadInScope(leadId))) return;
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
  if (!(await leadInScope(leadId))) return;
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
  if (!(await leadInScope(leadId))) return;
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

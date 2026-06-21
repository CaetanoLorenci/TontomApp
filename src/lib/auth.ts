import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase-server";
import { supabaseAdmin } from "./supabase";

export type SessionUser = { id: string; email: string | null; org: string };

// Exige login. Retorna o usuário + a org dele. Sem sessão → manda pro /login.
// (Transição: se não houver usuário Supabase mas o Basic Auth estiver ativo, o proxy
//  já liberou; nesse caso caímos na org 'amplia' como padrão.)
export async function getSessionUser(): Promise<SessionUser | null> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  // descobre a org do usuário (org_members). Default 'amplia' se não houver vínculo ainda.
  const { data: member } = await supabaseAdmin()
    .from("org_members")
    .select("org_slug")
    .eq("user_id", user.id)
    .maybeSingle();

  return { id: user.id, email: user.email ?? null, org: member?.org_slug ?? "amplia" };
}

// Org do contexto atual (default 'amplia' enquanto o multi-tenant não está 100%).
export async function currentOrg(): Promise<string> {
  const u = await getSessionUser();
  return u?.org ?? "amplia";
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

// Escopo de leitura: Amplia (org 'amplia') vê TUDO; cliente vê só a org dele.
// Sem sessão (acesso via Basic Auth na transição) = tratado como Amplia.
export type Scope = { org: string; seesAll: boolean; email: string | null };
export async function getScope(): Promise<Scope> {
  const u = await getSessionUser();
  if (!u) return { org: "amplia", seesAll: true, email: null };
  return { org: u.org, seesAll: u.org === "amplia", email: u.email };
}

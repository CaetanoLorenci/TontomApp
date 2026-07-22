import { createSign } from "crypto";

// Google Sheets via conta de serviço (metrificador-bot) — sem SDK: JWT RS256
// assinado com o crypto nativo + fetch na API v4. Escopo restrito a spreadsheets.
// A permissão real vem do COMPARTILHAMENTO da planilha com o e-mail do bot.

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URI = "https://oauth2.googleapis.com/token";

function creds(): { email: string; key: string } | null {
  // trim: env var cadastrada via pipe pode vir com \r\n no fim (quebrou o iss do JWT em prod)
  const email = process.env.GOOGLE_SA_EMAIL?.trim();
  const key = process.env.GOOGLE_SA_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  if (!email || !key) return null;
  return { email, key };
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

// token de acesso (~1h). Cache simples em módulo — o cron roda 1x, mas evita
// pedir token de novo em chamadas na mesma execução.
let cached: { token: string; exp: number } | null = null;

export async function sheetsAccessToken(): Promise<string | null> {
  const c = creds();
  if (!c) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > now + 60) return cached.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: c.email, scope: SCOPE, aud: TOKEN_URI, iat: now, exp: now + 3600 }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(c.key).toString("base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
  });
  if (!res.ok) {
    console.error("[sheets] token falhou:", res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return json.access_token;
}

async function api(path: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
  const token = await sheetsAccessToken();
  if (!token) return null;
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    console.error("[sheets] api falhou:", res.status, await res.text());
    return null;
  }
  return (await res.json()) as Record<string, unknown>;
}

// título da primeira aba (gid 0) — não hardcodar "Saldo da Semana" caso renomeiem
export async function firstSheetTitle(spreadsheetId: string): Promise<string | null> {
  const meta = await api(`${spreadsheetId}?fields=sheets(properties(sheetId,title))`);
  const sheets = (meta?.sheets as { properties: { sheetId: number; title: string } }[] | undefined) ?? [];
  return sheets.find((s) => s.properties.sheetId === 0)?.properties.title ?? sheets[0]?.properties.title ?? null;
}

export async function readRange(spreadsheetId: string, range: string): Promise<string[][] | null> {
  const json = await api(`${spreadsheetId}/values/${encodeURIComponent(range)}`);
  return (json?.values as string[][] | undefined) ?? (json ? [] : null);
}

// adiciona linhas no fim da tabela (append da API acha a última linha sozinho)
export async function appendRows(spreadsheetId: string, range: string, values: string[][]): Promise<boolean> {
  if (!values.length) return true;
  const json = await api(`${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values }),
  });
  return json != null;
}

// escreve várias faixas de uma vez (RAW = valor literal, sem interpretação)
export async function batchUpdateValues(
  spreadsheetId: string,
  data: { range: string; values: string[][] }[],
): Promise<boolean> {
  if (!data.length) return true;
  const json = await api(`${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
  return json != null;
}

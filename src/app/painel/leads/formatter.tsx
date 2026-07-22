"use client";

import { useMemo, useState } from "react";
import { CopyShare } from "@/components/copy-share";

/* Conversor Central de Leads → WhatsApp.
   Cola o CSV exportado (ou as células copiadas da planilha) e cada lead vira um
   card no formato de repasse pro cliente: perguntas do formulário na ordem,
   depois Nome / E-mail / Telefone. Tudo client-side — nenhum lead sai do navegador. */

// colunas técnicas que NÃO são pergunta de formulário — cobre o CSV do formulário
// (inglês) e o export da Central de Leads (português: Criado em/Fonte/Estágio…)
const META_COLS = new Set([
  "id", "lead_id", "created_time", "data_de_criacao", "ad_id", "ad_name", "adset_id", "adset_name",
  "campaign_id", "campaign_name", "form_id", "form_name", "is_organic", "platform", "retailer_item_id",
  "lead_status", "vehicle", "post_id", "page_id", "page_name", "partner_name", "channel",
  "criado_em", "fonte", "formulario", "canal", "estagio", "proprietario", "rotulos", "origem",
  "anuncio", "conjunto_de_anuncios", "campanha", "etiquetas", "status", "atribuido_a",
]);

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// parser CSV/TSV com aspas (o export do Meta usa vírgula; colar do Excel vem com TAB)
function parseTable(raw: string): string[][] {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const sep = first.includes("\t") ? "\t" : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); cell = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

type Lead = { when: string | null; campaign: string | null; text: string };

function toLeads(rows: string[][]): Lead[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  const keys = headers.map(norm);
  return rows.slice(1).map((r) => {
    const get = (...names: string[]) => {
      const i = keys.findIndex((k) => names.includes(k));
      return i >= 0 ? (r[i] ?? "").trim() : "";
    };
    const nome = get("full_name", "nome", "nome_completo", "name");
    const email = get("email", "e_mail");
    // Meta exporta telefone como "p:+5562984026185" — repassar limpo, como no print.
    // Central de Leads tem até 3 colunas de telefone; usa a primeira preenchida.
    const tel = (
      get("phone_number", "telefone", "phone") ||
      get("numero_de_telefone") ||
      get("numero_do_whatsapp")
    )
      .replace(/^p:/i, "")
      .replace(/^\+?55/, "")
      .replace(/[^\d]/g, "");
    const when = get("created_time", "data_de_criacao", "criado_em") || null;
    const campaign = get("campaign_name", "campanha") || get("form_name", "formulario") || null;

    const lines: string[] = [];
    headers.forEach((h, i) => {
      const k = keys[i];
      const v = (r[i] ?? "").trim();
      if (!v || META_COLS.has(k)) return;
      if (
        [
          "full_name", "nome", "nome_completo", "name", "email", "e_mail",
          "phone_number", "telefone", "phone", "numero_de_telefone", "numero_do_whatsapp",
        ].includes(k)
      )
        return;
      // export do formulário traz a pergunta em snake_case — devolver legível
      const pretty = h.includes("_") && !h.includes(" ") ? h.replace(/_+/g, " ").trim() : h;
      lines.push(pretty.charAt(0).toUpperCase() + pretty.slice(1), v); // pergunta, resposta
    });
    if (nome) lines.push("Nome:", nome);
    if (email) lines.push("E-mail:", email);
    if (tel) lines.push("Telefone:", tel);
    return { when, campaign, text: lines.join("\n") };
  }).filter((l) => l.text.trim() !== "");
}

export function LeadsFormatter() {
  const [raw, setRaw] = useState("");
  const leads = useMemo(() => {
    try {
      return toLeads(parseTable(raw));
    } catch {
      return [];
    }
  }, [raw]);

  return (
    <div className="mt-4 space-y-4">
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={6}
        placeholder={"Cola aqui o CSV exportado da Central de Leads (ou as células copiadas da planilha, com a linha de cabeçalho).\nNada é enviado a lugar nenhum — a conversão acontece só no seu navegador."}
        className="w-full rounded-xl border border-line bg-transparent px-3.5 py-2.5 font-mono text-xs placeholder:text-faint focus:border-signal/60 focus:outline-none"
      />

      {raw.trim() !== "" && leads.length === 0 && (
        <p className="text-sm text-st-agen">
          Não reconheci leads aqui — confere se a primeira linha é o cabeçalho (full_name, email, phone_number…).
        </p>
      )}

      {leads.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-mist">
              <strong className="text-snow">{leads.length}</strong> lead{leads.length > 1 ? "s" : ""} prontos pra repasse
            </p>
            <CopyShare text={leads.map((l) => l.text).join("\n\n————————\n\n")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {leads.map((l, i) => (
              <section key={i} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="num text-[10px] text-faint">
                    {l.when ? (l.when.includes("T") ? l.when.replace("T", " ").slice(0, 16) : l.when) : `lead ${i + 1}`}
                    {l.campaign ? ` · ${l.campaign}` : ""}
                  </span>
                  <CopyShare text={l.text} />
                </div>
                <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-line/60 bg-pane2/60 p-3 font-sans text-sm leading-relaxed text-mist">
                  {l.text}
                </pre>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

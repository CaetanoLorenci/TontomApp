"use client";

import { useRef, useState } from "react";
import { createUploadUrl, createRequestRich } from "../actions";
import { supabaseBrowser } from "@/lib/supabase-browser";

// Composer da Central com ANEXOS. Upload vai direto pro Storage (URL assinada),
// então aguenta arquivo grande (vídeo) sem esbarrar no limite das server actions.
export function CentralComposer() {
  const [kind, setKind] = useState("geral");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const uploaded: { path: string; name: string; mime: string }[] = [];
      const sb = supabaseBrowser();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress(`Enviando arquivo ${i + 1} de ${files.length}…`);
        const u = await createUploadUrl(f.name, f.type);
        if (!u.ok || !u.path || !u.token) {
          setResult({ ok: false, msg: u.error ?? "Falha ao preparar o upload." });
          return;
        }
        const { error } = await sb.storage
          .from("client-uploads")
          .uploadToSignedUrl(u.path, u.token, f, { contentType: f.type });
        if (error) {
          setResult({ ok: false, msg: `Falha ao enviar "${f.name}".` });
          return;
        }
        uploaded.push({ path: u.path, name: f.name, mime: f.type });
      }
      setProgress(null);
      const res = await createRequestRich({ kind, body, files: uploaded });
      setResult(res);
      if (res.ok) {
        setBody("");
        setFiles([]);
        if (fileRef.current) fileRef.current.value = "";
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        style={{ colorScheme: "dark" }}
        className="w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none sm:w-56"
      >
        <option value="geral">Geral</option>
        <option value="anuncio">Pedido de anúncio</option>
        <option value="app">Feedback do app</option>
      </select>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Escreva seu pedido, sugestão ou observação…"
        className="w-full resize-none rounded-xl border border-line bg-transparent px-3 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="btn btn-ghost">
          📎 Anexar criativos
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*,application/pdf"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="hidden"
          />
        </label>
        {files.length > 0 && (
          <span className="text-xs text-mist">
            {files.length} arquivo(s): {files.map((f) => f.name).join(", ").slice(0, 60)}
            {files.map((f) => f.name).join(", ").length > 60 ? "…" : ""}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary"
        >
          {busy ? "Enviando…" : "Enviar"}
        </button>
        {progress && <span className="text-xs text-mist">{progress}</span>}
        {result && (
          <span className={`text-sm ${result.ok ? "text-st-vend" : "text-st-perd"}`}>
            {result.ok ? "✓ " : "✕ "}
            {result.msg}
          </span>
        )}
      </div>
    </form>
  );
}

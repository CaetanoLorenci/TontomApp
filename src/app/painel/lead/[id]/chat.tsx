"use client";

import { useOptimistic, useRef, useEffect, useState } from "react";
import { replyToLead } from "../../actions";
import { stripInvisible } from "@/lib/code";
import { formatDay } from "@/lib/format";
import { IconChat } from "@/components/icons";

type Msg = {
  id: string;
  direction: "in" | "out";
  content: string | null;
  created_at: string;
  status?: string | null;
  pending?: boolean;
};

// Recibo do WhatsApp pras mensagens que enviamos (✓ enviado, ✓✓ entregue, ✓✓ azul lido).
function Ticks({ status }: { status?: string | null }) {
  if (status === "failed") return <span className="text-st-perd">· falhou ✕</span>;
  if (status === "read") return <span className="text-st-qual" title="Lido">✓✓</span>;
  if (status === "delivered") return <span title="Entregue">✓✓</span>;
  return <span title="Enviado">✓</span>; // sent ou sem status ainda
}

// Chat com resposta OTIMISTA: a mensagem aparece na hora, o envio roda em
// segundo plano. Sem esperar o round-trip do WhatsApp + recarregamento.
export function Chat({ leadId, messages }: { leadId: string; messages: Msg[] }) {
  const [optimistic, addOptimistic] = useOptimistic<Msg[], Msg>(messages, (state, m) => [...state, m]);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [optimistic.length]);

  async function send(formData: FormData) {
    const text = String(formData.get("text") ?? "").trim();
    if (!text) return;
    setError(null);
    formRef.current?.reset();
    // timestamp/id num event handler (fora do render) é permitido
    addOptimistic({
      id: `tmp-${Date.now()}`,
      direction: "out",
      content: text,
      created_at: new Date().toISOString(),
      pending: true,
    });
    const res = await replyToLead(formData);
    if (res && res.ok === false) {
      // não enviou: avisa e devolve o texto pro campo pra não perder
      setError(res.error ?? "Não foi possível enviar.");
      if (inputRef.current) inputRef.current.value = text;
    }
  }

  const byDay: { day: string; items: Msg[] }[] = [];
  for (const m of optimistic) {
    const day = formatDay(m.created_at);
    const last = byDay[byDay.length - 1];
    if (last && last.day === day) last.items.push(m);
    else byDay.push({ day, items: [m] });
  }

  return (
    <>
      <section>
        {optimistic.length === 0 ? (
          <div className="card border-dashed p-10 text-center text-faint">
            <p>Nenhuma mensagem registrada ainda.</p>
            <p className="mt-1 text-xs">As mensagens chegam aqui em tempo real.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {byDay.map((g) => (
              <div key={g.day}>
                <div className="my-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-line" />
                  <span className="text-[10px] font-medium uppercase tracking-widest text-faint">{g.day}</span>
                  <div className="h-px flex-1 bg-line" />
                </div>
                <div className="space-y-2">
                  {g.items.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                          m.direction === "out"
                            ? "rounded-br-md bg-signal-soft text-snow"
                            : "rounded-bl-md border border-line bg-pane text-snow"
                        } ${m.pending ? "opacity-60" : ""}`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {m.content ? stripInvisible(m.content) : <span className="italic text-faint">(mídia/sem texto)</span>}
                        </p>
                        <p className={`num mt-1 flex items-center gap-1 text-[10px] ${m.direction === "out" ? "justify-end text-signal/70" : "text-faint"}`}>
                          {m.pending
                            ? "enviando…"
                            : new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          {m.direction === "out" && !m.pending && <Ticks status={m.status} />}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </section>

      <section className="mt-4">
        <form ref={formRef} action={send} className="flex items-center gap-2">
          <input type="hidden" name="leadId" value={leadId} readOnly />
          <input
            ref={inputRef}
            name="text"
            autoComplete="off"
            placeholder="Responder pelo WhatsApp…"
            className="flex-1 rounded-2xl border border-line bg-pane px-4 py-3 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-2xl bg-signal px-4 py-3 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]"
          >
            <IconChat size={16} />
            Enviar
          </button>
        </form>
        {error && (
          <p className="mt-2 rounded-xl border border-st-perd/40 bg-st-perd/10 px-3 py-2 text-xs text-st-perd">
            {error}
          </p>
        )}
        <p className="mt-1.5 px-1 text-[10px] text-faint">
          Envia pelo WhatsApp oficial. Funciona na janela de 24h após a última mensagem do lead.
        </p>
      </section>
    </>
  );
}

"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { LogoMark } from "@/components/icons";

// Login por CÓDIGO (6 dígitos) + link mágico como alternativa.
// Motivo: no iPhone, um PWA instalado tem armazenamento próprio, separado do Safari.
// O link mágico abre no Safari e a sessão NÃO entra no app instalado. Digitar o código
// dentro do app resolve — a sessão fica no lugar certo. O link segue valendo no desktop.
export default function Login() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: {
        // só quem já foi convidado/criado entra (onboarding controlado pela Amplia)
        shouldCreateUser: false,
        // mantém o link mágico no e-mail (funciona no desktop); o código vem junto
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }
    // Sessão criada no app. Navegação cheia leva o cookie pro proxy → painel.
    window.location.href = "/painel";
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <div className="atmosphere" />
      <div className="card relative z-10 w-full max-w-sm p-8">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <span className="font-head text-xl font-extrabold tracking-tight">
            Amplia <span className="text-signal">Hub</span>
          </span>
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode} className="mt-6">
            <h1 className="text-lg font-bold">Entrar</h1>
            <p className="mt-1 text-sm text-mist">Acesso por código — sem senha.</p>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="mt-4 w-full rounded-xl border border-line bg-transparent px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
            />
            {error && <p className="mt-2 text-xs text-st-perd">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-xl bg-signal px-4 py-2.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              {loading ? "Enviando…" : "Enviar código"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-6">
            <h1 className="text-lg font-bold">Digite o código</h1>
            <p className="mt-1 text-sm text-mist">
              Mandamos um código de 6 dígitos pra <span className="font-semibold text-snow">{email}</span>.
            </p>
            <input
              type="text"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="num mt-4 w-full rounded-xl border border-line bg-transparent px-3.5 py-2.5 text-center text-2xl tracking-[0.4em] placeholder:text-faint focus:border-signal/60 focus:outline-none"
            />
            {error && <p className="mt-2 text-xs text-st-perd">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="mt-4 w-full rounded-xl bg-signal px-4 py-2.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-faint">
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                className="underline transition-colors hover:text-snow"
              >
                trocar e-mail
              </button>
              <span className="text-right">No computador? O e-mail também tem um link.</span>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

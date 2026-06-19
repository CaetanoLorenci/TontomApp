"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { LogoMark } from "@/components/icons";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      // só quem já foi convidado/criado entra (onboarding controlado pela Amplia)
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
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

        {sent ? (
          <div className="mt-6">
            <h1 className="text-lg font-bold">Verifique seu e-mail ✉️</h1>
            <p className="mt-2 text-sm text-mist">
              Mandamos um link de acesso pra <span className="font-semibold text-snow">{email}</span>.
              Abra no mesmo dispositivo pra entrar.
            </p>
            <button
              onClick={() => setSent(false)}
              className="mt-4 text-xs text-faint underline transition-colors hover:text-snow"
            >
              usar outro e-mail
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6">
            <h1 className="text-lg font-bold">Entrar</h1>
            <p className="mt-1 text-sm text-mist">Acesso por link mágico — sem senha.</p>
            <input
              type="email"
              required
              autoFocus
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
              {loading ? "Enviando…" : "Enviar link de acesso"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

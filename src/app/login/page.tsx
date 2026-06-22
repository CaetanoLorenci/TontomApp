"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { LogoMark } from "@/components/icons";

// Login por e-mail + senha. Funciona 100% dentro do app instalado (PWA) no iPhone,
// sem depender de e-mail/SMTP. A senha é definida pela Amplia em /painel/acesso.
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setLoading(false);
      setError("E-mail ou senha incorretos.");
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

        <form onSubmit={submit} className="mt-6">
          <h1 className="text-lg font-bold">Entrar</h1>
          <p className="mt-1 text-sm text-mist">Acesse com seu e-mail e senha.</p>

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
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="sua senha"
            className="mt-3 w-full rounded-xl border border-line bg-transparent px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
          />

          {error && <p className="mt-2 text-xs text-st-perd">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-signal px-4 py-2.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.02] disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>

          <p className="mt-4 text-xs text-faint">
            Sem acesso ou esqueceu a senha? Fale com a Amplia pra definir uma nova.
          </p>
        </form>
      </div>
    </main>
  );
}

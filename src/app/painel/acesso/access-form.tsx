"use client";

import { useActionState } from "react";
import { setAccessPassword } from "../actions";

type Org = { slug: string; name: string };

// Formulário (só Amplia) pra criar/redefinir senha de acesso — sem e-mail/SMTP.
// A própria pessoa digita a senha aqui; nada de senha trafega por chat/log.
export function AccessForm({ orgs, defaultEmail }: { orgs: Org[]; defaultEmail: string }) {
  const [state, action, pending] = useActionState(setAccessPassword, null);

  return (
    <form action={action} className="mt-3 space-y-3">
      <div>
        <label className="text-xs text-mist">E-mail</label>
        <input
          name="email"
          type="email"
          required
          defaultValue={defaultEmail}
          placeholder="pessoa@email.com"
          className="mt-1 w-full rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
        />
      </div>

      <div>
        <label className="text-xs text-mist">Senha (mín. 8 caracteres)</label>
        <input
          name="password"
          type="text"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="defina uma senha"
          className="num mt-1 w-full rounded-xl border border-line bg-transparent px-3.5 py-2 text-sm placeholder:text-faint focus:border-signal/60 focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-faint">
          Fica visível pra você copiar e repassar. A pessoa pode usar e guardar no gerenciador de senhas.
        </p>
      </div>

      <div>
        <label className="text-xs text-mist">Vincular a um cliente (opcional)</label>
        <select
          name="orgSlug"
          defaultValue=""
          style={{ colorScheme: "dark" }}
          className="mt-1 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm focus:border-signal/60 focus:outline-none"
        >
          <option value="">— sem vínculo (acesso Amplia, vê tudo) —</option>
          {orgs.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.name} ({o.slug})
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-faint">
          Com vínculo, a pessoa vê só os dados desse cliente. Sem vínculo, é acesso interno da Amplia.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-ink transition-transform hover:scale-[1.03] disabled:opacity-50"
      >
        {pending ? "Salvando…" : "Salvar acesso"}
      </button>

      {state && (
        <p className={`text-sm ${state.ok ? "text-st-vend" : "text-st-perd"}`}>
          {state.ok ? "✓ " : "✕ "}
          {state.msg}
        </p>
      )}
    </form>
  );
}

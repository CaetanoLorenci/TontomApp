"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Conta } from "@/lib/relatorios/meta";

// Dropdown de cliente (= conta de anúncio). Troca a conta preservando o período
// atual na URL (preset ou since/until).
export function SeletorConta({ contas, atual }: { contas: Conta[]; atual: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    params.set("conta", e.target.value);
    router.push(`/painel/relatorios?${params.toString()}`);
  }

  return (
    <label className="flex shrink-0 items-center gap-2 rounded-xl border border-line bg-pane px-3 py-1.5 text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">Cliente</span>
      <select
        value={atual}
        onChange={onChange}
        style={{ colorScheme: "dark" }}
        className="max-w-[180px] truncate bg-transparent font-medium text-snow focus:outline-none"
      >
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
    </label>
  );
}
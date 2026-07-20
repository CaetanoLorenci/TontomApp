// Tendência de custo compartilhada entre a lista e o detalhe da conta.
// Subir custo é RUIM (vermelho), cair é BOM (verde); <5% = ruído, não mostra.
export function pct(cur: number, prev: number): number | null {
  if (!(prev > 0)) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export function CostTrend({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur == null || prev == null) return null;
  const p = pct(cur, prev);
  if (p == null || Math.abs(p) < 5) return null;
  const up = p > 0;
  return (
    <span className={`num text-[11px] font-bold ${up ? "text-st-perd" : "text-st-vend"}`}>
      {up ? "↑" : "↓"}{Math.abs(p)}%
    </span>
  );
}

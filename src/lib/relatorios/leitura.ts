// "O que esse período diz" — leitura em linguagem de DONO de negócio.
// Regras anti-vaidade da Amplia: foco em custo por RESULTADO real (conversa/lead),
// não em alcance/curtida. Sinaliza desperdício, saturação e gasto de vaidade.

import { brl } from "@/lib/format";
import type { Relatorio, Linha } from "./meta";

export function gerarLeitura({ total, campanhas, criativos }: Relatorio): string[] {
  const bullets: string[] = [];
  const ativas = campanhas.filter((c) => c.resultados > 0);

  // Custo por resultado do período.
  if (total.cpr != null) {
    bullets.push(
      `No período, cada resultado (conversa/lead) custou em média ${brl.format(total.cpr)} — ` +
        `${total.resultados} resultados com ${brl.format(total.gasto)} investidos. ` +
        `Esse é o número que importa, não o alcance.`,
    );
  } else if (total.gasto > 0) {
    bullets.push(
      `Foram ${brl.format(total.gasto)} investidos e nenhum resultado real (conversa/lead) registrado. ` +
        `Sinal de alerta: a verba não está virando contato.`,
    );
  }

  // Gasto de vaidade: campanha com gasto e zero resultado (engajamento puro).
  const vaidade = campanhas.filter((c) => c.gasto > 0 && c.resultados === 0);
  if (vaidade.length) {
    const nomes = vaidade
      .slice(0, 3)
      .map((c) => `"${c.campanha}" (${brl.format(c.gasto)})`)
      .join(", ");
    bullets.push(
      `Verba em campanha sem resultado real: ${nomes}. ` +
        `Geram curtida/visualização, não cliente — candidatas a redirecionar pra campanha de conversa/venda.`,
    );
  }

  // Melhor x pior campanha por custo por resultado.
  if (ativas.length >= 2) {
    const melhor = ativas.reduce((a, b) => (a.cpr! <= b.cpr! ? a : b));
    const pior = ativas.reduce((a, b) => (a.cpr! >= b.cpr! ? a : b));
    if (melhor.campanha !== pior.campanha) {
      bullets.push(
        `A campanha "${melhor.campanha}" traz resultado a ${brl.format(melhor.cpr!)}, ` +
          `enquanto "${pior.campanha}" sai por ${brl.format(pior.cpr!)} — ` +
          `${(pior.cpr! / melhor.cpr!).toFixed(1)}x mais cara. Vale mover verba pra onde o resultado é mais barato.`,
      );
    }
  }

  // Melhor criativo.
  const criativosAtivos = criativos.filter((a) => a.resultados > 0);
  if (criativosAtivos.length) {
    const top = criativosAtivos.reduce((a, b) => (a.cpr! <= b.cpr! ? a : b));
    bullets.push(
      `O criativo campeão foi "${top.criativo}": ${top.resultados} resultados a ${brl.format(top.cpr!)} cada. ` +
        `É o que merece mais verba e novas variações.`,
    );
  }

  // Criativos caros (desperdício).
  if (total.cpr != null && criativosAtivos.length) {
    const caros = criativosAtivos.filter((a) => a.cpr! > total.cpr! * 2.5);
    if (caros.length) {
      const nomes = caros
        .slice(0, 3)
        .map((a) => `"${a.criativo}" (${brl.format(a.cpr!)})`)
        .join(", ");
      bullets.push(
        `Criativos bem acima da média: ${nomes}. Estão puxando o custo pra cima — candidatos a pausar.`,
      );
    }
  }

  // Frequência alta = saturação.
  const saturadas = campanhas.filter((c: Linha) => c.frequencia >= 2.5);
  if (saturadas.length) {
    const nomes = saturadas.map((c) => `"${c.campanha}" (${c.frequencia.toFixed(1)}x)`).join(", ");
    bullets.push(
      `Frequência alta em ${nomes}: as mesmas pessoas estão vendo o anúncio várias vezes. ` +
        `Público saturando — hora de renovar criativo ou ampliar público.`,
    );
  }

  if (bullets.length === 0) {
    bullets.push("Sem dados suficientes no período para uma leitura.");
  }
  return bullets;
}
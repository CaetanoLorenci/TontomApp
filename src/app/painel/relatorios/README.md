# Relatórios (área isolada — João Pedro)

Relatório de **desempenho das campanhas (Meta)** por período que o cliente escolher.
Anti-vaidade: custo por **resultado real** (conversa de WhatsApp + lead de formulário), não alcance.

- Rota: **`/painel/relatorios`** (acessível por URL; protegida pelo `proxy.ts`).
- Período: atalhos (este mês / mês passado / 30d / 7d) **+ de/até livre** (`?since=&until=`).
- Fonte: Meta Marketing API via `META_ADS_TOKEN` + `META_AD_ACCOUNT_ID` (mesmas envs do app).
- Arquivos: `src/lib/relatorios/{meta,periodo,leitura}.ts` + `src/app/painel/relatorios/page.tsx`.

## Pedidos ao dono do repo (não editei nada fora da minha área)
1. **Link no menu:** adicionar item "Relatórios" → `/painel/relatorios` em `src/components/panel-nav.tsx`
   (incluir a key `"relatorios"` no type `Key` e na lista `BASE`). Hoje a página usa `active="painel"`.
2. **Entrega automática (dia 5):** quando quiser o agendamento, dá pra expor
   `src/app/api/relatorios/route.ts` e registrar um cron na Vercel (`vercel.json`) — ambos fora da minha área.
3. **Sem dependências novas** — usa só `@supabase/supabase-js`/`next`/`react`/`fetch` nativo.

## Próximos (v2)
- Filtro por cliente (quando houver orgs além de `amplia`): filtrar campanhas pelos anúncios com lead da org (via `clicks.ad_id`).
- Exportar PDF / enviar ao cliente.
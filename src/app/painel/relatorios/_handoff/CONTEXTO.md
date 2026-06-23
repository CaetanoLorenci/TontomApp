# Contexto — Automação de Relatórios (Amplia Hub) — handoff entre conversas

> Leia este arquivo ANTES de mexer em qualquer coisa. Ele resume tudo que foi
> decidido e descoberto na conversa anterior (sessão "relatórios"), pra você
> continuar sem refazer trabalho. Repo PÚBLICO → **nunca** escreva segredos aqui.

## Quem / o quê
- **João Pedro**, cuida de IA e tráfego na **Amplia** (agência de Chapecó/SC).
- Objetivo: **relatório de desempenho das campanhas** dentro do Amplia Hub, por
  **período que o cliente escolher** (sob demanda) + **entrega automática** (ex.: dia 5).
- **Posicionamento ANTI-VAIDADE** (define o tom de tudo): mede CLIENTE/RESULTADO real
  (conversa de WhatsApp, lead, venda), nunca curtida/alcance. "Lead barato é a doença,
  não a cura." "A atribuição mora no CRM, não no pixel." O relatório mostra **custo por
  resultado real**, não custo por clique.

## Decisão de arquitetura (já travada)
- O relatório **vem da META (campanhas)**, não do CRM. (O cruzamento mídia×venda/CAC
  já existe na página `/painel/anuncios` — NÃO duplicar.)
- Os dashboards `/painel` e `/painel/anuncios` já são **ao vivo** (janelas 7/30/90d).
  O que `/painel/relatorios` adiciona é a **foto por período fechado/escolhido**, com a
  leitura **"o que esse período diz"** em linguagem de dono — peça pro cliente.

## ⚠️ REGRAS DE ISOLAMENTO (obrigatórias — repo mantido por equipe paralela)
- Criar/editar APENAS em: `src/app/painel/relatorios/**`, `src/app/api/relatorios/**`,
  `src/lib/relatorios/**`, `src/components/relatorios/**`. **Nada fora disso.**
- Banco: **SOMENTE LEITURA** nas tabelas existentes (sem INSERT/UPDATE/DELETE/ALTER/DROP).
  Precisa persistir algo? Só em tabela com prefixo **`rel_`**.
- Dependências: **só o já instalado** (`@supabase/supabase-js`, `@supabase/ssr`, `next`,
  `react`, `web-push`, `fetch` nativo). **NÃO editar `package.json`** — se faltar lib,
  anotar no README e o dono instala. (Gráfico = SVG puro, sem lib.)
- **Não editar o menu** (`src/components/panel-nav.tsx`) — pedir no README. Páginas
  acessíveis por URL direta.
- Git: commitar **só** arquivos das pastas `relatorios/`. Se `git status` mostrar algo
  fora, NÃO usar `git add -A` — adicionar só as pastas próprias.

## Realidade do repo (difere do handoff original — atenção!)
- Estrutura é **`src/` na RAIZ**, NÃO `web/src/` (o handoff dizia `web/` — está errado).
- Repo é **PÚBLICO** (handoff dizia privado). Remote: `github.com/CaetanoLorenci/TontomApp`,
  branch padrão `main`. Auto-deploy na Vercel.
- **Next.js 16 + React 19 + Tailwind v4.** Rodar: `npm install && npm run dev`
  (na raiz). Há `AGENTS.md`/`CLAUDE.md` avisando: Next 16 tem breaking changes —
  ler `node_modules/next/dist/docs/` antes de usar APIs do framework. O "middleware"
  virou **`src/proxy.ts`** (protege `/painel/**`).
- Existem clones/branches paralelos: **`TontomApp-portal`** (branch `feat/portal-amplia`,
  pasta `criativos/`) e `feat/portal`. **NÃO tocar** — é o time paralelo.

## Convenções da casa (use, não reinvente)
- Ler dados: `import { supabaseAdmin } from "@/lib/supabase"` (service role, server-only).
  NÃO usar anon (RLS ligado sem policies → anon não lê nada).
- Escopo multi-cliente: `import { getScope } from "@/lib/auth"` → `{ org, seesAll }`.
  `seesAll` (org `amplia`) vê tudo; senão `.eq("org_id", org)`. Sem sessão (Basic Auth de
  transição) cai em `amplia/seesAll=true`.
- Página = **server component**, `export const dynamic = "force-dynamic"`,
  `searchParams` é **Promise** (await). Renderiza `<PanelNav active="painel" seesAll={...}/>`.
  ⚠️ O tipo `active` de PanelNav NÃO tem "relatorios" — passar `"painel"` e pedir o item de
  menu no README (não editar panel-nav).
- Helpers `@/lib/format`: `brl` (instância → `brl.format(n)`), `STAGE_META`, `formatWhen`,
  `BR_TZ`/`BR_OFFSET` (fuso Brasília fixo -03:00; servidor roda em UTC → sempre fixar fuso).
- Design Tailwind v4 (sem shadcn): classes `card p-4`, `num`, `text-snow/mist/faint`,
  `text-signal`/`bg-signal`/`bg-signal-soft`, `bg-pane`/`bg-pane2`, `border-line`,
  `<div className="atmosphere"/>` dentro de `<main className="relative min-h-screen">`.
  Cores de estágio: `--color-st-novo/qual/agen/vend/perd`.
- Ícones `@/components/icons`: IconAdvance, IconBell, IconBroadcast, IconCalendar, IconCash,
  IconChat, IconClock, IconDownload, IconFunnel, IconMetaOk, IconPhone, IconSale, IconTarget,
  IconTrend, IconWarn, LogoMark.
- **Reutilizável**: `@/lib/meta-ads` já tem `getAdsPerformance(datePreset)`,
  `getAccountFinance()`, `getAdCreatives(sb, ids)`. (Mas só `date_preset`; pra período
  arbitrário usamos `time_range` — ver `src/lib/relatorios/meta.ts`.)

## Modelo de dados (schema public — só leitura)
- `leads`: funil em `stage` (novo→qualificado→agendado→vendido|perdido), `value` (R$ da
  venda), `org_id`, `click_id`, `scheduled_at`. `clicks`: `ad_id`/`adset_id`/`campaign_id`
  = ids da Meta, liga em `leads.click_id`. Também: `messages`, `capi_events`, `ad_creatives`,
  `organizations` (slug/name/mode), `org_members`, `lead_notes`.
- Estado real (jun/2026): só existe a org **`amplia`**, ~6 leads. Banco recém-nascido.
- **Meta**: UMA conta só, `act_1181511090176599` (da Amplia). "Amplia opera, cliente
  visualiza" — separa por `org_id` nos leads. Relatório por cliente (futuro) = filtrar
  anúncios pelos que têm lead da org (via `clicks.ad_id` ↔ `leads.org_id`).
- **Sem campo** para "motivo de não-fechamento" nem "show-up" (decidido: fora da v1).

## Bugs / gotchas que custaram tempo (NÃO repita)
1. **Tipo de "lead" varia por campanha.** WhatsApp = `onsite_conversion.messaging_conversation_started_7d`
   (fallback genérico `messaging_conversation_started`). Formulário = action **`lead`**.
   ⚠️ NÃO somar as variações `onsite_conversion.lead` / `lead_grouped` /
   `*_add_meta_leads` — são o MESMO lead contado de novo → contagem inflada. Use só `lead`.
2. **Campanhas da Amplia são de ENGAJAMENTO** (vaidade) — várias gastam com **0 resultado real**.
   A leitura anti-vaidade já flagra isso ("verba em campanha sem resultado").
3. **Período arbitrário na Meta**: usar `time_range={"since":"YYYY-MM-DD","until":"..."}`
   (JSON url-encoded). `getAdsPerformance` do app só faz `date_preset` — por isso criamos
   `getRelatorioMeta(since, until)` em `src/lib/relatorios/meta.ts`.
4. **Auth do git nesta máquina**: NÃO há token nem chave SSH; o keychain não tem credencial
   salva. Clone/fetch funcionam porque o repo é **público**; **push exige login** (token/SSH ou
   publicar pelo VSCode logado no GitHub). Foi o que bloqueou o push.
5. **VSCode com múltiplas pastas**: `amplia-hub` (protótipo, descartável), `Projetos IA`
   (projeto da mentoria Yark, sem relação) e `TontomApp` (este). Conferir sempre o canto
   inferior esquerdo (pasta + branch) antes de commitar/publicar.
6. Rodar local: env inline + `npm run dev -- -p 3100`. Login Basic Auth `amplia` /
   (senha em `PAINEL_PASSWORD` que você define) OU usuário criado `joaopaludo2@gmail.com`
   (senha foi compartilhada no chat — TROCAR).

## O que JÁ foi construído (v1) — branch `feat/relatorios`, commit `cb0cc9a`
- `src/lib/relatorios/meta.ts` — insights da Meta por período arbitrário; extrai resultado
  real (conversa + lead, sem double-count); agrega; CPR (custo por resultado).
- `src/lib/relatorios/periodo.ts` — atalhos (este-mes default / mes-passado / 7d / 30d) +
  livre `?since=&until=` (fuso BR).
- `src/lib/relatorios/leitura.ts` — "o que esse período diz" (gasto de vaidade, melhor/pior
  campanha por CPR, criativo campeão, caros, saturação por frequência).
- `src/app/painel/relatorios/page.tsx` — server component; PanelNav active="painel"; seletor
  de período + de/até; cards (Investido/Resultados/CPR/CTR/Freq); leitura; tabelas
  campanha + criativo.
- `src/app/painel/relatorios/README.md` — pedidos ao dono (link de menu; cron dia 5).
- Validado: typecheck + lint limpos; `next dev` HTTP 200 com dados reais de jun/2026.
  Isolamento ok (git status só mostra `relatorios/`).

## Pendências / próximos passos
1. **PUSH + PR**: `feat/relatorios` está commitada local mas **não pushada** (falta credencial;
   ver gotcha #4). Publicar pelo VSCode (pasta TontomApp aberta → Source Control → Publish
   Branch) OU com token, depois abrir PR `feat/relatorios → main`.
2. Dono do repo: adicionar item "Relatórios" no `panel-nav.tsx`.
3. v2: **entrega automática dia 5** (expor `src/app/api/relatorios/route.ts` + cron na Vercel
   `vercel.json` — fora da minha área, pedir ao dono); **export PDF/envio**; **filtro por
   cliente** quando houver orgs além de `amplia`.

## Segredos (NÃO commitar — pegar do .env.local/Vercel ou dos handoffs)
- `NEXT_PUBLIC_SUPABASE_URL` = https://qmgfghsmvonnlipdpaxx.supabase.co (não é segredo)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable, ok no browser)
- `SUPABASE_SERVICE_ROLE_KEY` (**segredo**), `META_ADS_TOKEN` (**segredo**),
  `META_AD_ACCOUNT_ID` = act_1181511090176599, `META_GRAPH_VERSION` = v21.0
- Detalhes completos de tabelas/chaves estão nos docs **HANDOFF-JOAO-PEDRO.md** e
  **HANDOFF-JOAO-CODIGO.md** (o João tem; NÃO versionar no repo público).
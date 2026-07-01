# Colaboração — DOIS Claudes no mesmo app (LEIA TODA SESSÃO)

Este repositório (Amplia Hub) é editado **em paralelo por dois Claude Code**:
- **Claude do João Pedro** (dev) — trabalha nas telas de relatórios/portal do cliente.
- **Claude do Caetano** (fundador) — trabalha no core: rastreio, webhook, conversão, multi-tenant.

Mesmo repo, mesmo banco Supabase, mesmo deploy Vercel. **Toda a disciplina abaixo existe pra vocês não se atropelarem nem gerarem "erro de continuação".** O elo humano é o **Caetano** — é por ele que um lado avisa o outro.

---

## 1. ANTES de começar qualquer coisa
1. **`git pull origin main`** — sincroniza com o que o outro Claude já pushou. É a causa nº1 de conflito. Nunca pule.
2. Rode `npm run build` uma vez se for mexer em algo sensível, pra partir de um estado limpo.

## 2. Os dois territórios — fique no seu
**Território do JOÃO (portal/relatórios):**
- `src/app/painel/{relatorios, criativos, projetos}`
- `src/app/painel/clientes/[slug]`
- `src/lib/relatorios`, `src/components/relatorios`
- Tabelas: `criativos`, `projetos`, `entregaveis` + colunas de perfil em `organizations`

**Território do CORE (Caetano):**
- `src/app/api/webhook/*`, `src/app/painel/actions.ts`
- `src/lib/{conversion, meta-capi, cloud-whatsapp, meta-ads, auth, push, code, whatsapp, format}`
- Telas `src/app/painel/{page, pipeline, agenda, lead, anuncios, central, acesso}`
- Multi-tenant/roteamento, schema core (leads/clicks/messages/capi_events/ad_routes/organizations base)

**Regra:** se a sua tarefa exigir mexer no território do outro lado, **PARE e reporte** (bloco 📮 abaixo) em vez de editar — o outro Claude pode estar mexendo nisso agora. Não faça o outro lado "de brinde".

## 3. Arquivos COMPARTILHADOS (coordene com cuidado)
`src/components/panel-nav.tsx`, `src/lib/auth.ts` (getScope), `src/app/globals.css`, `package.json`, e **qualquer migração de banco**. Mexeu num desses? **Avise no bloco 📮** — o outro lado depende deles.

## 4. Anti-travamento (o que prende o Claude)
- A regra do `AGENTS.md` de "ler o doc do Next antes de codar" é **pragmática, não literal**: só consulte o guia específico quando for usar uma API do Next que você não tem certeza do comportamento nesta versão. **Não leia doc preventivamente** pra mudança rotineira, e **nunca entre em loop** nisso. Doc não encontrado → siga com bom senso e valide com `npm run build`.
- **Não refatore "pra modularizar"** sem pedido. Faça a mudança mínima que resolve a tarefa.
- Travou ou em dúvida depois de ~2 tentativas? **Pare e reporte pro Caetano** em vez de insistir.

## 5. Commit / push / migração
- Commits pequenos e focados; mensagem clara do QUE mudou. **`npm run build` limpo ANTES de pushar.**
- Push no fim → deploy automático na Vercel.
- **Migração de banco = a coisa mais perigosa pros dois lados.** Sempre **aditiva e idempotente** (`add column if not exists`, `create table if not exists`), no seu domínio. Ao rodar uma, **AVISE no bloco 📮** — o outro Claude precisa saber que o schema mudou.
- Segredos (tokens) nunca no código — só em `.env.local` (gitignored) e nas Env Vars da Vercel.

## 6. 📮 Protocolo de sincronização
No **fim de toda sessão**, escreva um bloco:

```
📮 PRO CAETANO REPASSAR
- <schema que mudei / dependência nova / decisão que afeta o core / bug fora do meu
   território / pergunta pro outro Claude>
```

Se não tiver nada: **"📮 nada a sincronizar"**. O Caetano leva pro outro lado. Assim a ponte funciona nos dois sentidos, com ele no meio — e as duas máquinas ficam em sincronia.

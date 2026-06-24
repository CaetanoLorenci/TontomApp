-- Tontom — schema do banco (Supabase / Postgres)
-- Rode isto no SQL Editor do Supabase (uma vez). Idempotente o suficiente pra reaplicar em dev.
-- RLS fica LIGADA sem políticas públicas: todo acesso é server-side via service_role (que ignora RLS).
-- Auth/políticas multi-cliente entram na Fase 2.

-- ───────────────────────── clicks ─────────────────────────
-- Um registro por clique no anúncio (entrada do funil, rota /r).
create table if not exists public.clicks (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,           -- código TT-XXXXXX que vai na mensagem do WhatsApp
  fbclid      text,                            -- vindo da URL do anúncio (Meta cola)
  fbc         text,                            -- fb.1.<ts>.<fbclid> — pronto pro CAPI
  ctwa_clid   text,                            -- atribuição NATIVA de anúncio de WhatsApp (via externalAdReply do Z-API)
  utm_source  text,
  utm_medium  text,
  utm_campaign text,
  utm_content text,
  utm_term    text,
  ad_id       text,                            -- se o anúncio passar {{ad.id}} etc.
  adset_id    text,
  campaign_id text,
  referrer    text,
  user_agent  text,
  ip          text,
  created_at  timestamptz not null default now()
);

create index if not exists clicks_code_idx on public.clicks (code);
create index if not exists clicks_created_at_idx on public.clicks (created_at desc);

-- ───────────────────────── leads ─────────────────────────
-- Um registro por contato de WhatsApp. Atribuído ao clique pelo código da 1ª mensagem.
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  click_id      uuid references public.clicks (id),
  code          text,                          -- denormalizado p/ facilitar
  phone         text not null unique,          -- DDI+DDD+numero (chave do contato)
  name          text,
  first_message text,
  stage         text not null default 'novo',  -- novo | qualificado | agendado | vendido | perdido
  value         numeric(12,2),                 -- faturamento da venda (quando vendido)
  attributed_via text check (attributed_via in ('codigo','janela','ctwa')), -- como foi atribuído
  scheduled_at  timestamptz,                   -- data/hora do compromisso (mini-CRM/agenda)
  scheduled_note text,                          -- nota livre do agendamento
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists leads_stage_idx on public.leads (stage);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_click_id_idx on public.leads (click_id); -- cobre a FK (advisor de performance)
create index if not exists leads_scheduled_at_idx on public.leads (scheduled_at) where scheduled_at is not null;

-- ───────────────────────── capi_events ─────────────────────────
-- Log dos eventos enviados pro Meta (debug + idempotência).
create table if not exists public.capi_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references public.leads (id),
  event_name  text not null,                   -- Lead | Schedule | Purchase ...
  event_id    text not null,                   -- dedup key enviada pro Meta
  payload     jsonb,
  response    jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists capi_events_lead_idx on public.capi_events (lead_id);

-- ───────────────────────── messages ─────────────────────────
-- Conversa inteira salva no NOSSO banco (Z-API é só o cano de entrega).
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references public.leads (id),
  phone       text not null,
  direction   text not null check (direction in ('in','out')),
  content     text,
  zapi_message_id text,
  created_at  timestamptz not null default now()
);
create unique index if not exists messages_zapi_id_uidx on public.messages (zapi_message_id) where zapi_message_id is not null;
create index if not exists messages_lead_idx on public.messages (lead_id, created_at);
create index if not exists messages_phone_idx on public.messages (phone, created_at);

-- ───────────────────────── stage_triggers ─────────────────────────
-- Frases-gatilho (paridade TinTim): atendente manda a frase → estágio avança → CAPI dispara sozinho.
create table if not exists public.stage_triggers (
  id        uuid primary key default gen_random_uuid(),
  stage     text not null check (stage in ('qualificado','agendado','vendido','perdido')),
  phrase    text not null,           -- match case-insensitive por "contém"
  direction text not null default 'out' check (direction in ('in','out')),
  active    boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────── multi-tenant (white-label) ─────────────────────────
-- org_id (slug) em todas as tabelas; default 'amplia'. Login por cliente via Supabase Auth.
create table if not exists public.organizations (
  slug        text primary key,
  name        text not null,
  logo_url    text,
  brand_color text,
  created_at  timestamptz not null default now()
);
create table if not exists public.org_members (
  id         uuid primary key default gen_random_uuid(),
  org_slug   text not null references public.organizations (slug) on delete cascade,
  user_id    uuid not null,               -- auth.users(id)
  role       text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  unique (org_slug, user_id)
);
-- leads/clicks/messages/capi_events/stage_triggers/lead_notes têm: org_id text not null default 'amplia'

-- ───────────────────────── RLS ─────────────────────────
alter table public.clicks         enable row level security;
alter table public.leads          enable row level security;
alter table public.capi_events    enable row level security;
alter table public.messages       enable row level security;
alter table public.stage_triggers enable row level security;
-- Sem políticas: nega tudo por padrão. Acesso só via service_role (server). OK pro MVP.

-- ═════════════════════ Portal Amplia (perfil + entregáveis + projetos + criativos) ═════════════════════
-- Adicionado pela integração do protótipo de atendimento. Reaplicável (idempotente).

-- Perfil rico do cliente: estende organizations (já tem slug/name/logo_url/brand_color/mode).
alter table public.organizations add column if not exists segmento text;
alter table public.organizations add column if not exists contato_principal text;
alter table public.organizations add column if not exists contato_email text;
alter table public.organizations add column if not exists site text;
alter table public.organizations add column if not exists escopo_midia text;
alter table public.organizations add column if not exists observacoes text;
alter table public.organizations add column if not exists historico text;
alter table public.organizations add column if not exists tipografia text;
alter table public.organizations add column if not exists tom_voz text;

-- Entregáveis contratados por cliente.
create table if not exists public.entregaveis (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null default 'amplia' references public.organizations(slug) on delete cascade,
  tipo       text not null,            -- Gestão de Ads | Copy | Criativos | Relatório | Orgânico/Social | Outros
  frequencia text,                     -- Diária | Semanal | Quinzenal | Mensal | Sob demanda
  volume     text,                     -- ex.: "4 criativos/mês"
  descricao  text,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists entregaveis_org_idx on public.entregaveis (org_id);

-- Projetos + report de desenvolvimento.
create table if not exists public.projetos (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null default 'amplia' references public.organizations(slug) on delete cascade,
  nome       text not null,
  status     text not null default 'andamento',  -- a_fazer | andamento | revisao | entregue
  tipo       text,                                -- Campanha | Conteúdo | Setup
  prioridade text,                                -- alta | media | baixa
  prazo      date,
  descricao  text,
  report     text,                                -- relatório de desenvolvimento (livre)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projetos_org_idx on public.projetos (org_id);

-- Criativos + fluxo de aprovação do cliente.
create table if not exists public.criativos (
  id                uuid primary key default gen_random_uuid(),
  org_id            text not null default 'amplia' references public.organizations(slug) on delete cascade,
  titulo            text not null,
  tipo              text,                     -- Foto | Vídeo | Arte | Render 3D
  descricao         text,
  arquivo_url       text,                     -- link/imagem do criativo
  status_aprovacao  text not null default 'pendente'
                      check (status_aprovacao in ('pendente','aprovado','reprovado')),
  motivo_reprovacao text,
  avaliado_em       timestamptz,
  avaliado_por      uuid,                     -- auth.users(id) de quem avaliou
  created_at        timestamptz not null default now()
);
create index if not exists criativos_org_idx on public.criativos (org_id);

-- Regra de negócio: reprovar exige motivo com no mínimo 25 palavras (reforço no banco).
create or replace function public.validar_reprovacao_criativo()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status_aprovacao = 'reprovado' then
    if new.motivo_reprovacao is null
       or array_length(regexp_split_to_array(btrim(new.motivo_reprovacao), '\s+'), 1) < 25 then
      raise exception 'O motivo da reprovação precisa ter ao menos 25 palavras.';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_validar_reprovacao_criativo on public.criativos;
create trigger trg_validar_reprovacao_criativo
  before insert or update on public.criativos
  for each row execute function public.validar_reprovacao_criativo();

-- RLS ligada sem políticas (mesmo padrão do resto: acesso só via service_role no server).
alter table public.entregaveis enable row level security;
alter table public.projetos    enable row level security;
alter table public.criativos   enable row level security;

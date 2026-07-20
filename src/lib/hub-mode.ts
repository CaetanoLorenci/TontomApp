// Modo do Hub (decisão Caetano 20/jul — pivô Optimize):
// GESTOR_MODE = true → o app é a DASH DE GESTÃO DE CONTAS (/painel/contas).
// Todo o resto (CRM, pipeline, agenda, anúncios, relatórios, criativos, projetos,
// central, clientes) fica em STAND-BY: fora da navegação, mas com rotas e backend
// vivos (webhook/CAPI/cron seguem rodando pros clientes da Amplia).
// Pra reativar um módulo: adicionar a key em GESTOR_KEYS (ou desligar o modo).
export const GESTOR_MODE = true;

// módulos visíveis no modo gestor — vamos ampliando aos poucos conforme a rotina pedir
export const GESTOR_KEYS = ["contas"] as const;

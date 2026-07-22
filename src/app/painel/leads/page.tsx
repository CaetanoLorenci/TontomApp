import { notFound } from "next/navigation";
import { getScope } from "@/lib/auth";
import { PanelNav } from "@/components/panel-nav";
import { LeadsFormatter } from "./formatter";

export const dynamic = "force-dynamic";

/* Leads → WhatsApp: transforma o export da Central de Leads no texto de repasse
   pro cliente (formato pergunta/resposta + Nome/E-mail/Telefone). Ponte manual
   enquanto não temos leads_retrieval na Página dos clientes — com o acesso, esta
   tela passa a puxar os leads direto da API. */

export default async function Leads() {
  const { seesAll } = await getScope();
  if (!seesAll) notFound();

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />
      <PanelNav active="leads" seesAll={seesAll} />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
        <h1 className="font-head text-2xl font-extrabold tracking-tight">Leads</h1>
        <p className="mt-1 text-sm text-mist">
          Exporta o CSV na Central de Leads da página do cliente (ou copia as células da planilha), cola aqui e cada
          lead sai pronto pra mandar no WhatsApp.
        </p>
        <LeadsFormatter />
      </div>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getScope } from "@/lib/auth";
import { AccessForm } from "./access-form";
import { PanelNav } from "@/components/panel-nav";

export const dynamic = "force-dynamic";

/* Acesso (só Amplia): cria/redefine senha de login — sem e-mail/SMTP.
   É como a Amplia provisiona o próprio acesso e o dos clientes. */

type Org = { slug: string; name: string };

export default async function Acesso() {
  const { seesAll, email } = await getScope();
  if (!seesAll) notFound();

  const { data: orgs } = await supabaseAdmin()
    .from("organizations")
    .select("slug, name")
    .neq("slug", "amplia")
    .order("created_at", { ascending: true });

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />

      <PanelNav active="acesso" seesAll={seesAll} />

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-8">
        <h1 className="font-head text-2xl font-extrabold tracking-tight">Definir acesso</h1>
        <p className="mt-1 text-sm text-mist">
          Cria ou redefine a senha de login de alguém. A pessoa entra no app com <span className="text-snow">e-mail + senha</span> —
          sem precisar de e-mail de confirmação. Funciona no app instalado do celular.
        </p>

        <section className="card mt-5 p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">Acesso por senha</h2>
          <AccessForm orgs={(orgs ?? []) as Org[]} defaultEmail={email ?? ""} />
        </section>

        <div className="mt-6 rounded-xl border border-line bg-pane p-4 text-xs text-mist">
          <p className="font-semibold text-snow">Como usar no iPhone</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Defina aqui a sua senha (e-mail já preenchido).</li>
            <li>No celular, abra o <span className="text-snow">app instalado</span> (ícone na tela inicial).</li>
            <li>Entre com e-mail + a senha que você definiu. Pronto.</li>
          </ol>
          <p className="mt-3 text-faint">
            Cliente esqueceu a senha? Volte aqui e defina uma nova — não há “esqueci minha senha” por e-mail (de propósito, evita depender de SMTP).
          </p>
        </div>
      </div>
    </main>
  );
}

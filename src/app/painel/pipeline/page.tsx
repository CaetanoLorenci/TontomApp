import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { getAdCreatives } from "@/lib/meta-ads";
import { Board, type PipelineCard } from "./board";
import { getScope } from "@/lib/auth";
import { LogoMark, IconCalendar, IconFunnel, IconChat, IconBroadcast } from "@/components/icons";

export const dynamic = "force-dynamic";

/* Pipeline (Kanban) — funil em colunas, arrastar lead entre estágios. */

type Row = {
  id: string;
  name: string | null;
  stage: string;
  value: number | null;
  scheduled_at: string | null;
  clicks: { utm_campaign: string | null; ad_id: string | null } | null;
};

export default async function Pipeline() {
  const sb = supabaseAdmin();
  const { org, seesAll } = await getScope();
  let q = sb
    .from("leads")
    .select("id, name, stage, value, scheduled_at, clicks(utm_campaign, ad_id)")
    .order("created_at", { ascending: false });
  if (!seesAll) q = q.eq("org_id", org);
  const { data } = await q;

  const leads = (data ?? []) as unknown as Row[];
  const creativeMap = await getAdCreatives(sb, leads.map((l) => l.clicks?.ad_id));

  const cards: PipelineCard[] = leads.map((l) => {
    const cr = l.clicks?.ad_id ? creativeMap.get(l.clicks.ad_id) : null;
    return {
      id: l.id,
      name: l.name,
      stage: l.stage,
      value: l.value,
      scheduled_at: l.scheduled_at,
      campaign: cr?.campaign_name ?? l.clicks?.utm_campaign ?? null,
      image: cr?.image_path ?? null,
    };
  });

  return (
    <main className="relative min-h-screen">
      <div className="atmosphere" />

      <header className="sticky top-0 z-20 border-b border-line bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/painel" className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="font-head text-lg font-extrabold tracking-tight">
              Amplia <span className="text-signal">Hub</span>
            </span>
          </Link>
          <nav className="flex rounded-xl border border-line bg-pane p-1 text-sm">
            <Link href="/painel" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-mist transition-colors hover:text-snow">
              <IconChat size={14} /> Painel
            </Link>
            <span className="flex items-center gap-1.5 rounded-lg bg-signal-soft px-3 py-1.5 font-semibold text-signal">
              <IconFunnel size={14} /> Pipeline
            </span>
            <Link href="/painel/agenda" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-mist transition-colors hover:text-snow">
              <IconCalendar size={14} /> Agenda
            </Link>
            <Link href="/painel/anuncios" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-mist transition-colors hover:text-snow">
              <IconBroadcast size={14} /> Anúncios
            </Link>
          </nav>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-6">
        <h1 className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-faint">
          <IconFunnel size={14} /> Pipeline — arraste os leads entre os estágios
        </h1>
        <Board initial={cards} />
      </div>
    </main>
  );
}

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { getAdCreatives } from "@/lib/meta-ads";
import { Board, type PipelineCard } from "./board";
import { getScope } from "@/lib/auth";
import { IconFunnel } from "@/components/icons";
import { PanelNav } from "@/components/panel-nav";

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

      <PanelNav active="pipeline" seesAll={seesAll} />

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-6">
        <h1 className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-faint">
          <IconFunnel size={14} /> Pipeline — arraste os leads entre os estágios
        </h1>
        <Board initial={cards} />
      </div>
    </main>
  );
}

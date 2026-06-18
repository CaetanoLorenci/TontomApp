import { IconBroadcast, IconWarn, IconAdvance } from "./icons";
import type { AdCreative } from "@/lib/meta-ads";

// Card de origem do lead: miniatura + campanha › conjunto › anúncio + criativo.
// Cai pro nome bruto (utm_campaign) se o criativo ainda não foi cacheado.

function AttrBadge({ via }: { via?: string | null }) {
  if (via === "ctwa") return <span className="text-[11px] font-semibold text-signal">nativo</span>;
  if (via === "janela") return <span className="text-[11px] text-st-agen">≈ janela</span>;
  if (via === "codigo") return <span className="text-[11px] text-mist">código</span>;
  return null;
}

export function AdSourceCard({
  creative,
  fallbackCampaign,
  adId,
  code,
  attributedVia,
}: {
  creative?: AdCreative | null;
  fallbackCampaign?: string | null;
  adId?: string | null;
  code?: string | null;
  attributedVia?: string | null;
}) {
  // sem nenhuma origem rastreada
  if (!creative && !fallbackCampaign && !adId) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-st-agen">
        <IconWarn size={14} /> sem origem rastreada
      </span>
    );
  }

  // tem criativo cacheado → card rico
  if (creative) {
    const idShort = creative.ad_id.length > 8 ? `…${creative.ad_id.slice(-6)}` : creative.ad_id;
    return (
      <div className="flex w-full gap-3">
        {creative.image_path ? (
          <a
            href={creative.permalink ?? creative.image_path}
            target="_blank"
            rel="noopener noreferrer"
            className="group/img relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-line sm:h-28 sm:w-28"
            title="ver anúncio"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={creative.image_path}
              alt={creative.title ?? "criativo"}
              className="h-full w-full object-cover transition-transform duration-300 group-hover/img:scale-110"
            />
          </a>
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-line bg-pane2 sm:h-28 sm:w-28">
            <IconBroadcast size={24} className="text-signal" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">
              {creative.campaign_name ?? "(campanha sem nome)"}
            </span>
            <AttrBadge via={attributedVia} />
          </div>
          <div className="num mt-0.5 truncate text-xs text-mist">
            {[creative.adset_name, creative.ad_name].filter(Boolean).join(" · ") || "—"}
          </div>
          {creative.title && (
            <div className="mt-1 truncate text-xs font-medium text-snow">{creative.title}</div>
          )}
          {creative.body && (
            <p className="mt-0.5 line-clamp-2 text-xs text-faint">{creative.body}</p>
          )}
          <div className="num mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-faint">
            <span>🆔 {idShort}</span>
            {creative.permalink && (
              <a
                href={creative.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-mist transition-colors hover:text-signal"
              >
                Ver anúncio <IconAdvance size={11} className="-rotate-45" />
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // sem criativo ainda (cache não populou) → fallback no nome bruto
  return (
    <div className="flex items-center gap-2 text-sm">
      <IconBroadcast size={15} className="text-signal" />
      <span className="font-medium">{fallbackCampaign ?? "(sem campanha)"}</span>
      <span className="num text-xs text-faint">
        {[adId && `ad ${adId}`, code].filter(Boolean).join(" · ")}
      </span>
      <AttrBadge via={attributedVia} />
    </div>
  );
}

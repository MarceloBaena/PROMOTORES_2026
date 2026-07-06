import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCcw } from "lucide-react";
import { PromotersLiveMap } from "../components/PromotersLiveMap";
import { PageHeader } from "../components/PageHeader";
import {
  accuracyLabel,
  formatLiveTime,
  hasCoordinates,
  liveStatusLabels,
  liveStatusStyles,
  mapsUrl,
  minutesAgo,
  operationalLabel,
  promoterCode,
  useLivePromoters
} from "../lib/live-map";

export function LiveMapPage() {
  const { items, message, loading, lastRefresh, connectedCount, inVisitCount, inRouteCount, reload } = useLivePromoters();
  const [selectedPromoterId, setSelectedPromoterId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPromoterId && items.some((item) => item.promoter.id === selectedPromoterId)) {
      return;
    }

    setSelectedPromoterId(items[0]?.promoter.id ?? null);
  }, [items, selectedPromoterId]);

  const selectedItem = useMemo(
    () =>
      items.find((item) => item.promoter.id === selectedPromoterId) ??
      items.find((item) => item.status === "online") ??
      items[0] ??
      null,
    [items, selectedPromoterId]
  );

  return (
    <section>
      <PageHeader
        title="Mapa ao vivo"
        subtitle="Acompanhe cada promotor em rota ou atendimento com mapa real, rastro recente e atualizacao automatica."
        action={
          <button type="button" className="secondary-button" onClick={() => void reload()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </button>
        }
      />

      {message ? <div className="notice notice-warning">{message}</div> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card">
          <div className="relative z-[1] text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Promotores conectados</div>
          <div className="relative z-[1] mt-3 font-display text-3xl font-bold">{connectedCount}</div>
          <div className="relative z-[1] mt-1 text-xs font-bold text-stone-500">Sinal recente no mapa operacional</div>
        </div>
        <div className="metric-card">
          <div className="relative z-[1] text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Em atendimento</div>
          <div className="relative z-[1] mt-3 font-display text-3xl font-bold">{inVisitCount}</div>
          <div className="relative z-[1] mt-1 text-xs font-bold text-stone-500">Visitas abertas neste momento</div>
        </div>
        <div className="metric-card">
          <div className="relative z-[1] text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Em rota</div>
          <div className="relative z-[1] mt-3 font-display text-3xl font-bold">{inRouteCount}</div>
          <div className="relative z-[1] mt-1 text-xs font-bold text-stone-500">Promotores com jornada ativa</div>
        </div>
        <div className="metric-card">
          <div className="relative z-[1] text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Ultima atualizacao</div>
          <div className="relative z-[1] mt-3 font-display text-xl font-bold">{lastRefresh ? formatLiveTime(lastRefresh.toISOString()) : "-"}</div>
          <div className="relative z-[1] mt-1 text-xs font-bold text-stone-500">Atualizacao automatica do painel</div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="surface-card overflow-hidden p-0">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Mapa operacional da equipe</h2>
              <p className="panel-subtitle">Visual de rua para acompanhar deslocamento online, ultima posicao e rastro recente.</p>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <PromotersLiveMap
              items={items}
              selectedPromoterId={selectedItem?.promoter.id ?? null}
              onSelectPromoter={setSelectedPromoterId}
            />
          </div>
        </div>

        <div className="table-wrap">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Promotores em campo</h2>
              <p className="panel-subtitle">Clique em um promotor para destacar o ponto no mapa.</p>
            </div>
          </div>

          {selectedItem ? (
            <div className="border-b border-line/70 p-4">
              <div className="rounded-3xl bg-navy p-4 text-white">
                <div className="font-mono text-[11px] font-black tracking-[0.16em] text-brandSoft">{promoterCode(selectedItem.promoter.code)}</div>
                <div className="mt-2 font-display text-2xl font-black">{selectedItem.promoter.name}</div>
                <div className="mt-1 text-sm font-semibold text-white/70">{selectedItem.promoter.supervisorName ?? "Sem supervisor"}</div>
                <div className="mt-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white/85">
                  {liveStatusLabels[selectedItem.status]}
                </div>
                <div className="mt-4 rounded-2xl bg-white/10 p-3 text-sm font-semibold text-white/80">
                  <div>{operationalLabel(selectedItem)}</div>
                  <div className="mt-1">Ultimo sinal: {minutesAgo(selectedItem.location?.capturedAt)} - {formatLiveTime(selectedItem.location?.capturedAt)}</div>
                  <div className="mt-1">{accuracyLabel(selectedItem.location)}</div>
                </div>
                {selectedItem.location && hasCoordinates(selectedItem.location) ? (
                  <a className="secondary-button mt-4 h-11 w-full !bg-white !text-graphite" href={mapsUrl(selectedItem.location)} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Abrir posicao no mapa externo
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="max-h-[680px] overflow-auto">
            {items.map((item) => {
              const selected = item.promoter.id === selectedItem?.promoter.id;

              return (
                <button
                  key={item.promoter.id}
                  type="button"
                  onClick={() => setSelectedPromoterId(item.promoter.id)}
                  className={`w-full border-b border-line/70 p-4 text-left transition last:border-b-0 hover:bg-skywash/70 ${selected ? "bg-brandSoft/60" : "bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-black tracking-[0.12em] text-brand">{promoterCode(item.promoter.code)}</div>
                      <div className="mt-1 truncate font-display text-lg font-bold text-ink">{item.promoter.name}</div>
                      <div className="truncate text-xs font-semibold text-stone-500">{item.promoter.supervisorName ?? "Sem supervisor"}</div>
                    </div>
                    <span className={`inline-flex h-7 items-center rounded-full px-3 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${liveStatusStyles[item.status]}`}>
                      {liveStatusLabels[item.status]}
                    </span>
                  </div>

                  <div className="mt-4 rounded-2xl bg-field p-3 text-sm">
                    <div className="font-bold text-graphite">{operationalLabel(item)}</div>
                    <div className="mt-1 text-xs font-semibold text-stone-500">
                      Ultimo sinal: {minutesAgo(item.location?.capturedAt)} - {formatLiveTime(item.location?.capturedAt)}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-stone-500">{accuracyLabel(item.location)}</div>
                  </div>
                </button>
              );
            })}

            {items.length === 0 ? (
              <div className="p-8 text-center text-sm font-semibold text-stone-500">Nenhum promotor ativo encontrado.</div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

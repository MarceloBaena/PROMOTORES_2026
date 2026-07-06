import { Fragment, useEffect, useMemo, useRef } from "react";
import { ExternalLink, LocateFixed, Navigation, RadioTower, Route, TimerReset, UserRound } from "lucide-react";
import { CircleMarker, MapContainer, Popup, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { latLng, latLngBounds, type LatLngExpression } from "leaflet";
import {
  accuracyLabel,
  formatLiveTime,
  hasCoordinates,
  LIVE_MAP_REFRESH_INTERVAL_MS,
  liveStatusLabels,
  mapsUrl,
  minutesAgo,
  operationalLabel,
  promoterCode,
  type LivePromoter
} from "../lib/live-map";

const DEFAULT_CENTER: LatLngExpression = [-15.6014, -56.0979];

function signalColors(status: LivePromoter["status"], selected: boolean) {
  if (status === "online") {
    return {
      stroke: selected ? "#0f766e" : "#059669",
      fill: selected ? "#10b981" : "#34d399",
      trail: selected ? "#2563eb" : "#6ee7b7"
    };
  }

  if (status === "stale") {
    return {
      stroke: selected ? "#b45309" : "#d97706",
      fill: selected ? "#f59e0b" : "#fbbf24",
      trail: selected ? "#2563eb" : "#fcd34d"
    };
  }

  return {
    stroke: selected ? "#1e3a8a" : "#475569",
    fill: selected ? "#3b82f6" : "#94a3b8",
    trail: selected ? "#2563eb" : "#cbd5e1"
  };
}

function resolveFocusedPromoter(items: LivePromoter[], selectedPromoterId?: string | null) {
  const selected = items.find((item) => item.promoter.id === selectedPromoterId && hasCoordinates(item.location));

  if (selected) {
    return selected;
  }

  return (
    items.find((item) => item.status === "online" && hasCoordinates(item.location)) ??
    items.find((item) => hasCoordinates(item.location)) ??
    null
  );
}

function routeWindowLabel(item: LivePromoter) {
  if (item.activeVisit) {
    return item.activeVisit.routeName ?? "Rota em execucao";
  }

  if (item.activeRoute) {
    return item.activeRoute.name;
  }

  return "Sem rota ativa";
}

function nextClientLabel(item: LivePromoter) {
  if (item.activeVisit) {
    return item.activeVisit.clientName;
  }

  if (item.activeRoute?.nextClientName) {
    return item.activeRoute.nextClientName;
  }

  return "Sem proximo cliente definido";
}

function MapViewportController({
  items,
  focusedPromoter,
  compact
}: {
  items: LivePromoter[];
  focusedPromoter: LivePromoter | null;
  compact: boolean;
}) {
  const map = useMap();
  const focusedRef = useRef<string | null>(null);

  const coordinates = useMemo(
    () =>
      items
        .filter((item) => hasCoordinates(item.location))
        .map((item) => latLng(item.location!.latitude as number, item.location!.longitude as number)),
    [items]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 60);

    return () => window.clearTimeout(timer);
  }, [map, coordinates.length, compact]);

  useEffect(() => {
    if (focusedPromoter?.location && hasCoordinates(focusedPromoter.location)) {
      const nextCenter = latLng(focusedPromoter.location.latitude as number, focusedPromoter.location.longitude as number);
      const shouldRecenter =
        focusedRef.current !== focusedPromoter.promoter.id || !map.getBounds().pad(-0.35).contains(nextCenter);

      if (shouldRecenter) {
        map.flyTo(nextCenter, compact ? 13 : 15, { duration: 0.8 });
      }

      focusedRef.current = focusedPromoter.promoter.id;
      return;
    }

    if (coordinates.length === 1) {
      map.setView(coordinates[0], compact ? 12 : 13);
      return;
    }

    if (coordinates.length > 1) {
      map.fitBounds(latLngBounds(coordinates), {
        padding: compact ? [24, 24] : [40, 40],
        maxZoom: compact ? 13 : 15
      });
    }
  }, [compact, coordinates, focusedPromoter, map]);

  return null;
}

export function PromotersLiveMap({
  items,
  selectedPromoterId,
  onSelectPromoter,
  compact = false,
  heightClassName
}: {
  items: LivePromoter[];
  selectedPromoterId?: string | null;
  onSelectPromoter?: (promoterId: string) => void;
  compact?: boolean;
  heightClassName?: string;
}) {
  const focusedPromoter = useMemo(() => resolveFocusedPromoter(items, selectedPromoterId), [items, selectedPromoterId]);
  const mapHeight = heightClassName ?? (compact ? "h-[18rem]" : "h-[38rem]");
  const locatedItems = useMemo(() => items.filter((item) => hasCoordinates(item.location)), [items]);
  const onlineCount = useMemo(() => items.filter((item) => item.status === "online").length, [items]);
  const activeVisitCount = useMemo(() => items.filter((item) => item.activeVisit).length, [items]);
  const activeRouteCount = useMemo(() => items.filter((item) => item.activeRoute).length, [items]);

  if (locatedItems.length === 0) {
    return (
      <div className={`relative overflow-hidden rounded-[1.35rem] bg-[#dfe8df] ${mapHeight}`}>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(17,25,23,0.06)_1px,transparent_1px),linear-gradient(rgba(17,25,23,0.06)_1px,transparent_1px)] bg-[size:54px_54px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_28%,rgba(37,111,75,0.18),transparent_22rem),radial-gradient(circle_at_74%_70%,rgba(54,95,120,0.18),transparent_20rem)]" />
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div className="max-w-md rounded-3xl border border-white/80 bg-white/92 p-7 shadow-xl backdrop-blur">
            <LocateFixed className="mx-auto h-10 w-10 text-stone-400" />
            <h3 className="mt-4 font-display text-2xl font-bold text-ink">Nenhuma posicao recebida</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-stone-500">
              O mapa aparece assim que um promotor abrir o aplicativo durante a jornada autorizada e enviar a localizacao.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`live-map-shell relative overflow-hidden rounded-[1.35rem] ${mapHeight}`}>
      <MapContainer center={DEFAULT_CENTER} zoom={12} scrollWheelZoom className="live-leaflet-map h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        <MapViewportController items={locatedItems} focusedPromoter={focusedPromoter} compact={compact} />

        {locatedItems.map((item) => {
          const location = item.location;

          if (!location || !hasCoordinates(location)) {
            return null;
          }

          const selected = item.promoter.id === focusedPromoter?.promoter.id;
          const colors = signalColors(item.status, selected);
          const trailPositions =
            item.trail
              ?.filter(hasCoordinates)
              .map((point) => [point.latitude as number, point.longitude as number] as LatLngExpression) ?? [];

          return (
            <Fragment key={item.promoter.id}>
              {trailPositions.length >= 2 ? (
                <>
                  {selected ? (
                    <Polyline
                      positions={trailPositions}
                      pathOptions={{
                        color: "#ffffff",
                        weight: compact ? 8 : 10,
                        opacity: 0.96,
                        lineCap: "round",
                        lineJoin: "round"
                      }}
                    />
                  ) : null}
                  <Polyline
                    positions={trailPositions}
                    pathOptions={{
                      color: colors.trail,
                      weight: selected ? (compact ? 4 : 5) : compact ? 2.5 : 3,
                      opacity: selected ? 0.96 : 0.62,
                      lineCap: "round",
                      lineJoin: "round",
                      dashArray: selected ? undefined : "10 10"
                    }}
                  />
                </>
              ) : null}

              {selected ? (
                <CircleMarker
                  center={[location.latitude as number, location.longitude as number]}
                  radius={compact ? 18 : 22}
                  pathOptions={{
                    color: "#ffffff",
                    fillColor: colors.fill,
                    fillOpacity: 0.14,
                    weight: 2
                  }}
                />
              ) : null}

              <CircleMarker
                center={[location.latitude as number, location.longitude as number]}
                radius={selected ? 11 : compact ? 7 : 9}
                pathOptions={{
                  color: colors.stroke,
                  fillColor: colors.fill,
                  fillOpacity: 0.95,
                  weight: selected ? 4 : 3
                }}
                eventHandlers={{
                  click: () => onSelectPromoter?.(item.promoter.id)
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={1} permanent={selected}>
                  <div className="text-xs font-black text-ink">{promoterCode(item.promoter.code)}</div>
                  <div className="text-[11px] font-semibold text-stone-600">{item.promoter.name}</div>
                </Tooltip>
                <Popup minWidth={compact ? 220 : 260}>
                  <div className="space-y-2">
                    <div className="font-mono text-[11px] font-black tracking-[0.14em] text-brand">{promoterCode(item.promoter.code)}</div>
                    <div className="font-display text-lg font-black text-ink">{item.promoter.name}</div>
                    <div className="text-xs font-semibold text-stone-500">{item.promoter.supervisorName ?? "Sem supervisor"}</div>
                    <div className="rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-stone-600">
                      <div className="font-bold text-graphite">{operationalLabel(item)}</div>
                      <div className="mt-1">Ultimo sinal: {minutesAgo(location.capturedAt)} - {formatLiveTime(location.capturedAt)}</div>
                      <div className="mt-1">{accuracyLabel(location)}</div>
                    </div>
                    <a
                      className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white no-underline"
                      href={mapsUrl(location)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Abrir no mapa
                    </a>
                  </div>
                </Popup>
              </CircleMarker>
            </Fragment>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute left-4 top-4 z-[500] max-w-[min(100%-2rem,30rem)]">
        <div className="rounded-[1.1rem] border border-white/80 bg-white/92 px-3 py-3 shadow-xl backdrop-blur">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-500">Controle ao vivo</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-brandSoft px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-brand">
              <RadioTower className="h-4 w-4" />
              {onlineCount} conectados
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">
              <UserRound className="h-4 w-4" />
              {activeVisitCount} em atendimento
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700">
              <Route className="h-4 w-4" />
              {activeRouteCount} em rota
            </span>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-4 z-[500]">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/95 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-800 shadow-lg backdrop-blur">
          <TimerReset className="h-4 w-4" />
          Atualizacao a cada {LIVE_MAP_REFRESH_INTERVAL_MS / 1000}s
        </span>
      </div>

      {focusedPromoter?.location ? (
        <div className="absolute bottom-4 left-4 right-4 z-[500]">
          <div className="rounded-[1.6rem] border border-white/80 bg-white/94 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-[11px] font-black tracking-[0.14em] text-brand">
                  {promoterCode(focusedPromoter.promoter.code)}
                </div>
                <div className="truncate font-display text-xl font-black text-ink">{focusedPromoter.promoter.name}</div>
                <div className="mt-1 truncate text-sm font-bold text-stone-500">{focusedPromoter.promoter.supervisorName ?? "Sem supervisor"}</div>
              </div>
              <div className="text-right">
                <div className="inline-flex rounded-full bg-navy px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white">
                  {liveStatusLabels[focusedPromoter.status]}
                </div>
                <div className="mt-2 text-xs font-semibold text-stone-500">{minutesAgo(focusedPromoter.location.capturedAt)}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-500">Operacao</div>
                <div className="mt-1 text-sm font-black text-ink">{operationalLabel(focusedPromoter)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-500">Rota</div>
                <div className="mt-1 text-sm font-black text-ink">{routeWindowLabel(focusedPromoter)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-500">Proximo ponto</div>
                <div className="mt-1 text-sm font-black text-ink">{nextClientLabel(focusedPromoter)}</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-semibold text-stone-500">
                <div>Ultimo envio: {formatLiveTime(focusedPromoter.location.capturedAt)}</div>
                <div>{accuracyLabel(focusedPromoter.location)}</div>
              </div>
              <a
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white no-underline shadow-lg shadow-brand/20"
                href={mapsUrl(focusedPromoter.location)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir navegacao
              </a>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-4 top-24 z-[500]">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/92 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-ink shadow-lg backdrop-blur">
          <Navigation className="h-4 w-4 text-brand" />
          Rastro recente da rota
        </span>
      </div>
    </div>
  );
}

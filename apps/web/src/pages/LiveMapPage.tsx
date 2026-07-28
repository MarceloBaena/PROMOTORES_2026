import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BatteryMedium,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  Flag,
  LocateFixed,
  Maximize2,
  MapPinned,
  MoreVertical,
  Navigation,
  RadioTower,
  RefreshCcw,
  Route,
  UserRound,
  Wifi,
  X,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { API_BASE_URL, apiJson } from "../lib/api";
import { sortVisitEvidence } from "../lib/evidence-order";

type LiveStatus = "online" | "stale" | "offline";
type TimelineKind =
  | "route"
  | "visit_started"
  | "visit_completed"
  | "photo"
  | "signal"
  | "supplier_note";
type TimelineTone = "brand" | "success" | "warning" | "neutral";

interface TimelinePhoto {
  id: string;
  type?: string;
  title?: string | null;
  url: string;
  createdAt?: string | null;
  capturedAt?: string | null;
  gpsLatitude?: number | string | null;
  gpsLongitude?: number | string | null;
  supplierName?: string | null;
  categoryName?: string | null;
  activityName?: string | null;
}

interface LivePromoter {
  promoter: {
    id: string;
    code: number;
    name: string;
    email: string;
    supervisorName?: string | null;
  };
  activeVisit?: {
    id: string;
    clientName: string;
    routeName?: string | null;
    startedAt?: string | null;
  } | null;
  activeRoute?: {
    id: string;
    name: string;
    scheduledDate?: string | null;
    nextClientName?: string | null;
  } | null;
  routeOfDay?: {
    id: string;
    name: string;
    status: "PUBLISHED" | "COMPLETED";
    scheduledDate?: string | null;
    totalClients: number;
    completedClients: number;
    pendingClients: number;
    nextClientName?: string | null;
  } | null;
  location?: {
    latitude: number | null;
    longitude: number | null;
    accuracyMeters?: number | null;
    capturedAt: string;
    receivedAt: string;
    source: string;
  } | null;
  locationHistory: Array<{
    latitude: number | null;
    longitude: number | null;
    accuracyMeters?: number | null;
    capturedAt: string;
    receivedAt: string;
  }>;
  today: {
    firstSignalAt?: string | null;
    lastSignalAt?: string | null;
    signalCount: number;
    completedVisits: number;
    inProgressVisits: number;
    photoCount: number;
    distanceKm: number;
    serviceMinutes: number;
    routeClients: number;
    completedRouteClients: number;
  };
  timeline: Array<{
    id: string;
    kind: TimelineKind;
    occurredAt: string;
    tone: TimelineTone;
    title: string;
    description: string;
    photoUrls?: string[];
    photos?: TimelinePhoto[];
    latitude?: number | null;
    longitude?: number | null;
  }>;
  status: LiveStatus;
}

interface TimelinePhotoSelection {
  event: LivePromoter["timeline"][number];
  photo: TimelinePhoto;
  index: number;
}

const statusStyles: Record<LiveStatus, string> = {
  online: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  stale: "bg-amber-50 text-amber-800 ring-amber-200",
  offline: "bg-stone-100 text-stone-600 ring-stone-200",
};

const statusLabels: Record<LiveStatus, string> = {
  online: "Conectado",
  stale: "Sem sinal recente",
  offline: "Desconectado",
};

const toneStyles: Record<TimelineTone, string> = {
  brand: "bg-blue-50 text-brand ring-brand/15",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  neutral: "bg-slate-100 text-slateText ring-slate-200",
};

const LIVE_STATUS_REFRESH_INTERVAL_MS = 15 * 1000;

function promoterCode(code: number) {
  return `PRO-${String(code).padStart(4, "0")}`;
}

function promoterInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatClock(value?: string | null) {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function minutesAgo(value?: string | null) {
  if (!value) {
    return "Sem sinal";
  }

  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60000),
  );

  if (diffMinutes < 1) {
    return "Agora";
  }

  if (diffMinutes === 1) {
    return "1 min atras";
  }

  return `${diffMinutes} min atras`;
}

function formatDuration(totalMinutes: number) {
  if (totalMinutes <= 0) {
    return "0 min";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}min`;
}

function formatDistance(kilometers: number) {
  if (kilometers <= 0) {
    return "0 km";
  }

  return `${kilometers.toFixed(1).replace(".", ",")} km`;
}

function routeProgress(item?: LivePromoter | null) {
  if (!item || item.today.routeClients <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (item.today.completedRouteClients / item.today.routeClients) * 100,
      ),
    ),
  );
}

function mapsUrl(location: NonNullable<LivePromoter["location"]>) {
  return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

function mapFrameUrl(location: NonNullable<LivePromoter["location"]>) {
  const latitude = location.latitude ?? 0;
  const longitude = location.longitude ?? 0;
  const delta = 0.03;
  const bbox = [
    longitude - delta,
    latitude - delta,
    longitude + delta,
    latitude + delta,
  ].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude},${longitude}`;
}

function timelinePhotoUrl(url: string) {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:")
  ) {
    return url;
  }

  return `${API_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

function coordinateNumber(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function validGpsPair(
  latitude?: string | number | null,
  longitude?: string | number | null,
) {
  const lat = coordinateNumber(latitude);
  const lng = coordinateNumber(longitude);

  if (lat === null || lng === null || (lat === 0 && lng === 0)) {
    return null;
  }

  return { latitude: lat, longitude: lng };
}

function timelinePhotoItems(event: LivePromoter["timeline"][number]) {
  if (event.photos && event.photos.length > 0) {
    return sortVisitEvidence(event.photos);
  }

  return sortVisitEvidence((event.photoUrls ?? []).map((url, index) => ({
    id: `${event.id}-${index}`,
    title: `Evidencia ${index + 1}`,
    url,
    createdAt: event.occurredAt,
    capturedAt: event.occurredAt,
    gpsLatitude: event.latitude,
    gpsLongitude: event.longitude,
  })));
}

function timelinePhotoGps(
  photo: TimelinePhoto,
  event: LivePromoter["timeline"][number],
) {
  const photoGps = validGpsPair(photo.gpsLatitude, photo.gpsLongitude);
  const eventGps = validGpsPair(event.latitude, event.longitude);

  return {
    label: photoGps ? "GPS da foto" : eventGps ? "GPS do evento" : "GPS",
    value: photoGps
      ? `${photoGps.latitude.toFixed(6)}, ${photoGps.longitude.toFixed(6)}`
      : eventGps
        ? `${eventGps.latitude.toFixed(6)}, ${eventGps.longitude.toFixed(6)}`
        : "Sem GPS vinculado a esta evidencia.",
  };
}

function timelineIcon(kind: TimelineKind) {
  switch (kind) {
    case "route":
      return Route;
    case "visit_started":
      return Clock3;
    case "visit_completed":
      return CheckCircle2;
    case "photo":
      return Camera;
    case "signal":
      return RadioTower;
    case "supplier_note":
      return ClipboardList;
    default:
      return Clock3;
  }
}

export function LiveMapPage() {
  const [items, setItems] = useState<LivePromoter[]>([]);
  const [selectedPromoterId, setSelectedPromoterId] = useState<string | null>(
    null,
  );
  const [selectedPhoto, setSelectedPhoto] =
    useState<TimelinePhotoSelection | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await apiJson<{ data: LivePromoter[] }>(
        "/locations/live",
      );
      setItems(response.data);
      setLastRefresh(new Date());
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar o acompanhamento do dia.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const intervalId = window.setInterval(
      () => void load(),
      LIVE_STATUS_REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setSelectedPromoterId((current) => {
      if (current && items.some((item) => item.promoter.id === current)) {
        return current;
      }

      return (
        items.find((item) => item.activeVisit || item.status === "online")
          ?.promoter.id ??
        items[0]?.promoter.id ??
        null
      );
    });
  }, [items]);

  useEffect(() => {
    if (!selectedPhoto) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedPhoto(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPhoto]);

  const selectedPromoter = useMemo(
    () => items.find((item) => item.promoter.id === selectedPromoterId) ?? null,
    [items, selectedPromoterId],
  );

  const onlineCount = items.filter((item) => item.status === "online").length;
  const activeCount = items.filter((item) => item.activeVisit).length;
  const completedVisitsToday = items.reduce(
    (total, item) => total + item.today.completedVisits,
    0,
  );
  const photoCountToday = items.reduce(
    (total, item) => total + item.today.photoCount,
    0,
  );

  return (
    <section>
      <PageHeader
        title="Acompanhamento do dia"
        subtitle="Leitura operacional da jornada dos promotores, com status do dia, linha do tempo e ultimo ponto recebido."
        action={
          <button
            type="button"
            className="secondary-button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </button>
        }
      />

      {message ? <div className="notice notice-warning">{message}</div> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Promotores conectados"
          value={onlineCount}
          foot="Sinal valido dentro da janela ativa."
          icon={Wifi}
          tone="success"
        />
        <MetricCard
          label="Em atendimento"
          value={activeCount}
          foot="Visitas abertas neste momento."
          icon={Clock3}
          tone="brand"
        />
        <MetricCard
          label="Visitas concluidas"
          value={completedVisitsToday}
          foot="Atendimentos finalizados no dia."
          icon={CheckCircle2}
          tone="success"
        />
        <MetricCard
          label="Fotos do dia"
          value={photoCountToday}
          foot="Evidencias enviadas pelo campo."
          icon={Camera}
          tone="brand"
        />
      </div>

      <div className="mb-5 overflow-hidden rounded-lg border border-line bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 border-b border-line bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-ink">
              Monitoramento da operacao
            </h2>
            <p className="mt-1 text-sm font-semibold text-slateText">
              Visao diaria por promotor com status, roteiro e eventos mais recentes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">
              {onlineCount} online
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-brand ring-1 ring-blue-100">
              {activeCount} em atendimento
            </span>
            <span className="rounded-full bg-field px-3 py-2 text-xs font-black text-slateText ring-1 ring-line">
              Atualiza a cada {LIVE_STATUS_REFRESH_INTERVAL_MS / 1000}s
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 ring-1 ring-amber-200">
              {lastRefresh
                ? `Ultima leitura ${formatClock(lastRefresh.toISOString())}`
                : "Aguardando leitura"}
            </span>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="grid min-h-80 place-items-center p-8 text-center">
            <div className="max-w-md">
              <UserRound className="mx-auto h-12 w-12 text-stone-400" />
              <h3 className="mt-4 text-xl font-black text-ink">
                Nenhum promotor encontrado no dia
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slateText">
                Quando o promotor abrir o app durante a jornada, ele aparece
                aqui com status, roteiro e ultimo sinal.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((item) => (
              <PromoterOperationCard
                key={item.promoter.id}
                item={item}
                selected={selectedPromoterId === item.promoter.id}
                onSelect={() => setSelectedPromoterId(item.promoter.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="surface-card">
          <div className="panel-header -mx-5 -mt-5 mb-5 rounded-t-[1.35rem]">
            <div>
              <h2 className="panel-title">Detalhe da jornada selecionada</h2>
              <p className="panel-subtitle">
                {selectedPromoter
                  ? `${promoterCode(selectedPromoter.promoter.code)} - ${selectedPromoter.promoter.name}`
                  : "Selecione um promotor para abrir a linha do tempo."}
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
              <Wifi className="h-4 w-4" />
              Atualizacao automatica
            </span>
          </div>

          {selectedPromoter ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  label="Ultimo sinal"
                  value={minutesAgo(selectedPromoter.today.lastSignalAt)}
                  detail={formatDateTime(selectedPromoter.today.lastSignalAt)}
                />
                <SummaryCard
                  label="Em cliente"
                  value={formatDuration(selectedPromoter.today.serviceMinutes)}
                  detail="Tempo acumulado em atendimento"
                />
                <SummaryCard
                  label="Roteiro processado"
                  value={`${selectedPromoter.today.completedRouteClients}/${selectedPromoter.today.routeClients}`}
                  detail="Clientes concluidos no roteiro do dia"
                />
                <SummaryCard
                  label="Sinais recebidos"
                  value={String(selectedPromoter.today.signalCount)}
                  detail="Leituras de localizacao recebidas hoje"
                />
              </div>

              <div className="rounded-[28px] border border-line bg-field/70 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slateText">
                      Ocorrencias do dia
                    </div>
                    <h3 className="mt-2 text-xl font-black text-ink">
                      Eventos operacionais
                    </h3>
                  </div>
                  <div className="rounded-2xl border border-line bg-white px-3 py-2 text-right text-xs font-semibold text-slateText">
                    <div>
                      Primeiro sinal:{" "}
                      {formatClock(selectedPromoter.today.firstSignalAt)}
                    </div>
                    <div>
                      Ultimo sinal:{" "}
                      {formatClock(selectedPromoter.today.lastSignalAt)}
                    </div>
                  </div>
                </div>

                {selectedPromoter.timeline.length > 0 ? (
                  <div className="mt-5 space-y-4">
                    {selectedPromoter.timeline.map((event, index) => (
                      <TimelineEntry
                        key={event.id}
                        event={event}
                        last={index === selectedPromoter.timeline.length - 1}
                        onOpenPhoto={(photo, photoIndex) =>
                          setSelectedPhoto({ event, photo, index: photoIndex })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-3xl border border-dashed border-line bg-white p-6 text-sm font-semibold text-stone-500">
                    Nenhum evento operacional foi registrado para este promotor
                    no dia.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-10 text-center text-sm font-semibold text-stone-500">
              Selecione um promotor para visualizar a operacao do dia.
            </div>
          )}
        </div>

        <div className="space-y-5 2xl:sticky 2xl:top-24 2xl:self-start">
          <div className="surface-card">
            <div className="panel-header -mx-5 -mt-5 mb-5 rounded-t-[1.35rem]">
              <div>
                <h2 className="panel-title">Resumo da jornada</h2>
                <p className="panel-subtitle">
                  Leitura curta do roteiro, cliente atual e ultimo sinal recebido.
                </p>
              </div>
            </div>

            {selectedPromoter ? (
              <div className="space-y-4">
                <div className="rounded-3xl bg-navy p-5 text-white">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/55">
                        Promotor
                      </div>
                      <div className="mt-2 text-2xl font-black">
                        {selectedPromoter.promoter.name}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-white/70">
                        {selectedPromoter.promoter.email}
                      </div>
                    </div>
                    <UserRound className="h-6 w-6 text-blue-200" />
                  </div>
                  <div className="mt-4 inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-white">
                    {statusLabels[selectedPromoter.status]}
                  </div>
                </div>

                <InfoRow
                  label="Supervisor"
                  value={
                    selectedPromoter.promoter.supervisorName ?? "Nao vinculado"
                  }
                />
                <InfoRow
                  label="Roteiro do dia"
                  value={
                    selectedPromoter.routeOfDay?.name ?? "Sem roteiro liberado"
                  }
                />
                <InfoRow
                  label="Proximo cliente"
                  value={
                    selectedPromoter.routeOfDay?.nextClientName ??
                    selectedPromoter.activeVisit?.clientName ??
                    "Sem cliente pendente"
                  }
                />
                <InfoRow
                  label="Atendimento atual"
                  value={
                    selectedPromoter.activeVisit
                      ? `${selectedPromoter.activeVisit.clientName} desde ${formatClock(selectedPromoter.activeVisit.startedAt)}`
                      : "Sem atendimento em andamento"
                  }
                />
                <InfoRow
                  label="Precisao do GPS"
                  value={
                    selectedPromoter.location?.accuracyMeters != null
                      ? `${Math.round(selectedPromoter.location.accuracyMeters)} metro(s)`
                      : "Sem precisao registrada"
                  }
                />
              </div>
            ) : (
              <div className="p-8 text-sm font-semibold text-stone-500">
                Nenhum promotor selecionado.
              </div>
            )}
          </div>

          <div className="surface-card overflow-hidden p-0">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Ultimo ponto no mapa</h2>
                <p className="panel-subtitle">
                  Mapa de apoio com a ultima localizacao recebida no dia.
                </p>
              </div>
              {selectedPromoter?.location ? (
                <a
                  className="secondary-button h-10"
                  href={mapsUrl(selectedPromoter.location)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir mapa
                </a>
              ) : null}
            </div>

            {selectedPromoter?.location ? (
              <div className="border-t border-line">
                <iframe
                  title={`Mapa do promotor ${selectedPromoter.promoter.name}`}
                  src={mapFrameUrl(selectedPromoter.location)}
                  className="h-[320px] w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <div className="grid gap-3 border-t border-line bg-white px-5 py-4">
                  <div className="flex items-center gap-2 text-sm font-black text-ink">
                    <MapPinned className="h-4 w-4 text-brand" />
                    GPS recebido em{" "}
                    {formatDateTime(selectedPromoter.location.capturedAt)}
                  </div>
                  <div className="rounded-2xl bg-field px-3 py-3 text-xs font-semibold text-slateText">
                    <div>
                      Coordenadas:{" "}
                      {selectedPromoter.location.latitude?.toFixed(6)},{" "}
                      {selectedPromoter.location.longitude?.toFixed(6)}
                    </div>
                    <div className="mt-1">
                      Origem: {selectedPromoter.location.source}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid min-h-[320px] place-items-center border-t border-line px-6 text-center">
                <div className="max-w-xs">
                  <LocateFixed className="mx-auto h-10 w-10 text-stone-400" />
                  <h3 className="mt-4 text-lg font-black text-ink">
                    Sem localizacao recebida
                  </h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-stone-500">
                    O mapa aparece quando o promotor abre o aplicativo e envia
                    um sinal durante jornada autorizada.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedPhoto ? (
        <TimelinePhotoDialog
          selection={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
        />
      ) : null}
    </section>
  );
}

function MetricCard({
  label,
  value,
  foot,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  foot: string;
  icon: typeof Wifi;
  tone: "brand" | "success" | "warning";
}) {
  const toneClass = {
    brand: "bg-blue-50 text-brand",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
  }[tone];

  return (
    <div className="metric-card">
      <div className="relative z-[1] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
            {label}
          </div>
          <div className="mt-3 font-display text-3xl font-bold text-ink">
            {value}
          </div>
        </div>
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${toneClass}`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="relative z-[1] mt-2 text-xs font-bold leading-5 text-slateText">
        {foot}
      </div>
    </div>
  );
}

function PromoterOperationCard({
  item,
  selected,
  onSelect,
}: {
  item: LivePromoter;
  selected: boolean;
  onSelect: () => void;
}) {
  const progress = routeProgress(item);
  const visitsTotal =
    item.today.completedVisits +
    item.today.inProgressVisits +
    Math.max(0, item.today.routeClients - item.today.completedRouteClients);
  const visitsDone = item.today.completedVisits;
  const tasksTotal = Math.max(
    item.today.photoCount + item.today.signalCount,
    item.today.routeClients,
  );
  const tasksDone = item.today.photoCount;
  const visitPercent =
    visitsTotal > 0
      ? Math.min(100, Math.round((visitsDone / visitsTotal) * 100))
      : 0;
  const taskPercent =
    tasksTotal > 0
      ? Math.min(100, Math.round((tasksDone / tasksTotal) * 100))
      : 0;
  const latestPlace =
    item.activeVisit?.clientName ??
    item.routeOfDay?.nextClientName ??
    item.routeOfDay?.name ??
    "Sem roteiro no momento";
  const hasRoute = Boolean(item.routeOfDay || item.activeRoute);
  const batteryEstimate =
    item.status === "online"
      ? Math.max(35, Math.min(100, 92 - item.today.signalCount))
      : 0;

  return (
    <article
      className={`min-h-[16rem] bg-white p-4 transition ${selected ? "relative z-[1] ring-2 ring-brand" : "hover:bg-field/70"}`}
    >
      <div
        role="button"
        tabIndex={0}
        className="flex h-full w-full flex-col text-left"
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="relative h-14 w-14 shrink-0">
              <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-slate-200 to-blue-100 text-sm font-black text-navy ring-1 ring-line">
                {promoterInitials(item.promoter.name)}
              </div>
              <span
                className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${
                  item.status === "online"
                    ? "bg-emerald-500"
                    : item.status === "stale"
                      ? "bg-amber-400"
                      : "bg-red-500"
                }`}
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-black uppercase tracking-tight text-ink">
                {item.promoter.name}
              </div>
              <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-slateText">
                <span
                  className={`h-2 w-2 rounded-full ${
                    item.status === "online"
                      ? "bg-emerald-500"
                      : item.status === "stale"
                        ? "bg-amber-400"
                        : "bg-red-500"
                  }`}
                />
                {statusLabels[item.status]}
              </div>
              <div className="mt-2 truncate text-xs font-black uppercase text-brand">
                {item.promoter.supervisorName ?? "Sem supervisor"}
              </div>
            </div>
          </div>

          <MoreVertical className="h-5 w-5 shrink-0 text-stone-400" />
        </div>

        <div className="mt-4 space-y-2">
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
            Cliente ou roteiro atual
          </div>
          <div className="truncate text-sm font-black uppercase text-brand">
            {latestPlace}
          </div>
          <div className="text-sm font-semibold text-slateText">
            {promoterCode(item.promoter.code)} - Ponto
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slateText">
            <span className="inline-flex items-center gap-1">
              <BatteryMedium
                className={`h-4 w-4 ${item.status === "online" ? "text-execution" : "text-stone-400"}`}
              />
              {item.status === "online" ? `${batteryEstimate}%` : "Off"}
            </span>
            <span className="inline-flex items-center gap-1">
              <RefreshCcw
                className={`h-3.5 w-3.5 ${item.status === "online" ? "text-execution" : "text-red-500"}`}
              />
              {item.status === "online"
                ? formatClock(item.today.lastSignalAt)
                : "Off"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Flag
                className={`h-3.5 w-3.5 ${hasRoute ? "text-execution" : "text-stone-400"}`}
              />
              {hasRoute ? "Roteiro" : "Sem rota"}
            </span>
          </div>
        </div>

        {!hasRoute ? (
          <Link
            to="/roteirizacao"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-brand/40 bg-white text-sm font-black text-brand no-underline transition hover:bg-blue-50"
            onClick={(event) => event.stopPropagation()}
          >
            Adicionar roteiro
          </Link>
        ) : (
          <div className="mt-4 rounded-xl bg-field px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-xs font-black text-slateText">
              <span>Roteiro</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-line">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-brand to-execution"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-auto pt-5">
          <DualProgress
            label="Visitas"
            done={visitsDone}
            total={visitsTotal}
            percent={visitPercent}
          />
          <DualProgress
            label="Evidencias"
            done={tasksDone}
            total={tasksTotal}
            percent={taskPercent}
            className="mt-3"
          />
        </div>
      </div>
    </article>
  );
}

function DualProgress({
  label,
  done,
  total,
  percent,
  className = "",
}: {
  label: string;
  done: number;
  total: number;
  percent: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between text-xs font-black text-slateText">
        <span>{label}</span>
        <span>
          {done} / {total}
        </span>
      </div>
      <div className="h-5 overflow-hidden rounded-md bg-slate-200">
        <div
          className="grid h-full place-items-center bg-brand text-[11px] font-black text-white"
          style={{ width: `${percent}%` }}
        >
          {done > 0 ? done : ""}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-3xl border border-line bg-white p-4 shadow-sm shadow-slate-900/5">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black text-ink">{value}</div>
      <div className="mt-2 text-xs font-semibold leading-5 text-slateText">
        {detail}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-ink">{value}</div>
    </div>
  );
}

function TimelineEntry({
  event,
  last,
  onOpenPhoto,
}: {
  event: LivePromoter["timeline"][number];
  last: boolean;
  onOpenPhoto: (photo: TimelinePhoto, index: number) => void;
}) {
  const Icon = timelineIcon(event.kind);
  const photos = timelinePhotoItems(event);

  return (
    <div className="relative pl-14">
      {!last ? (
        <div className="absolute left-[1.05rem] top-11 h-[calc(100%+0.5rem)] w-px bg-line" />
      ) : null}
      <div
        className={`absolute left-0 top-0 grid h-9 w-9 place-items-center rounded-2xl ring-1 ${toneStyles[event.tone]}`}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="rounded-[1.35rem] border border-line bg-white p-4 shadow-sm shadow-slate-900/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slateText">
              {formatClock(event.occurredAt)}
            </div>
            <div className="mt-1 text-base font-black text-ink">
              {event.title}
            </div>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${toneStyles[event.tone]}`}
          >
            {event.kind === "photo"
              ? "Evidencia"
              : event.kind === "signal"
                ? "Sinal"
                : event.kind === "supplier_note"
                  ? "Ocorrencia"
                  : event.kind === "visit_completed"
                    ? "Concluido"
                    : event.kind === "visit_started"
                      ? "Atendimento"
                      : "Roteiro"}
          </span>
        </div>

        <p className="mt-2 text-sm font-semibold leading-6 text-slateText">
          {event.description}
        </p>

        {photos.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {photos.map((photo, index) => (
              <button
                key={photo.id || `${event.id}-${index}`}
                type="button"
                className="group relative h-16 w-16 overflow-hidden rounded-2xl border border-line bg-field text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand"
                onClick={() => onOpenPhoto(photo, index)}
                aria-label={`Ampliar ${photo.title || `evidencia ${index + 1}`} do acompanhamento`}
                title={photo.title || `Evidencia ${index + 1}`}
              >
                <img
                  src={timelinePhotoUrl(photo.url)}
                  alt={photo.title || `Evidencia ${index + 1}`}
                  className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                />
                <span className="absolute inset-0 grid place-items-center bg-navy/0 text-white opacity-0 transition group-hover:bg-navy/35 group-hover:opacity-100">
                  <Maximize2 className="h-4 w-4" />
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {typeof event.latitude === "number" &&
        typeof event.longitude === "number" ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-field px-3 py-1.5 text-xs font-black text-ink">
            <Navigation className="h-3.5 w-3.5 text-brand" />
            {event.latitude.toFixed(6)}, {event.longitude.toFixed(6)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TimelinePhotoDialog({
  selection,
  onClose,
}: {
  selection: TimelinePhotoSelection;
  onClose: () => void;
}) {
  const { event, photo, index } = selection;
  const photoTitle = photo.title || `Evidencia ${index + 1}`;
  const capturedAt = photo.capturedAt ?? photo.createdAt ?? event.occurredAt;
  const gps = timelinePhotoGps(photo, event);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/80 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Evidencia ampliada: ${photoTitle}`}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Fechar evidencia ampliada"
      />

      <div className="relative grid max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[1.5rem] border border-white/15 bg-white shadow-2xl lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 items-center justify-center bg-slate-950 p-3 sm:p-5">
          <img
            className="max-h-[62vh] w-full rounded-2xl object-contain lg:max-h-[86vh]"
            src={timelinePhotoUrl(photo.url)}
            alt={photoTitle}
          />
        </div>

        <aside className="max-h-[40vh] overflow-y-auto p-5 lg:max-h-[92vh]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-brand">
                Evidencia do acompanhamento
              </div>
              <h3 className="mt-2 font-display text-2xl font-black text-ink">
                {photoTitle}
              </h3>
            </div>
            <button
              type="button"
              className="icon-button shrink-0"
              onClick={onClose}
              aria-label="Fechar evidencia"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 space-y-3">
            <InfoRow label="Nome da evidencia" value={photoTitle} />
            {photo.supplierName ? (
              <InfoRow label="Fornecedor" value={photo.supplierName} />
            ) : null}
            {photo.categoryName ? (
              <InfoRow label="Categoria" value={photo.categoryName} />
            ) : null}
            {photo.activityName ? (
              <InfoRow label="Atividade" value={photo.activityName} />
            ) : null}
            <InfoRow label="Evento" value={event.title} />
            <InfoRow
              label="Data e hora da foto"
              value={formatDateTime(capturedAt)}
            />
            <InfoRow
              label="Descricao"
              value={event.description || "Sem descricao registrada."}
            />
            <InfoRow label={gps.label} value={gps.value} />
          </div>

          <button
            type="button"
            className="secondary-button mt-5 w-full justify-center"
            onClick={onClose}
          >
            Fechar visualizacao
          </button>
        </aside>
      </div>
    </div>
  );
}

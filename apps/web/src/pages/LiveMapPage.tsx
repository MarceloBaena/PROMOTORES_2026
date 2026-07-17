import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  LocateFixed,
  MapPinned,
  Navigation,
  RadioTower,
  RefreshCcw,
  Route,
  UserRound,
  Wifi
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { apiJson } from "../lib/api";

type LiveStatus = "online" | "stale" | "offline";
type TimelineKind = "route" | "visit_started" | "visit_completed" | "photo" | "signal" | "supplier_note";
type TimelineTone = "brand" | "success" | "warning" | "neutral";

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
    latitude?: number | null;
    longitude?: number | null;
  }>;
  status: LiveStatus;
}

const statusStyles: Record<LiveStatus, string> = {
  online: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  stale: "bg-amber-50 text-amber-800 ring-amber-200",
  offline: "bg-stone-100 text-stone-600 ring-stone-200"
};

const statusLabels: Record<LiveStatus, string> = {
  online: "Conectado",
  stale: "Sem sinal recente",
  offline: "Desconectado"
};

const toneStyles: Record<TimelineTone, string> = {
  brand: "bg-blue-50 text-brand ring-brand/15",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  neutral: "bg-slate-100 text-slateText ring-slate-200"
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
    minute: "2-digit"
  }).format(new Date(value));
}

function formatClock(value?: string | null) {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function minutesAgo(value?: string | null) {
  if (!value) {
    return "Sem sinal";
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));

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

  return Math.max(0, Math.min(100, Math.round((item.today.completedRouteClients / item.today.routeClients) * 100)));
}

function mapsUrl(location: NonNullable<LivePromoter["location"]>) {
  return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

function mapFrameUrl(location: NonNullable<LivePromoter["location"]>) {
  const latitude = location.latitude ?? 0;
  const longitude = location.longitude ?? 0;
  const delta = 0.03;
  const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude},${longitude}`;
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
  const [selectedPromoterId, setSelectedPromoterId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await apiJson<{ data: LivePromoter[] }>("/locations/live");
      setItems(response.data);
      setLastRefresh(new Date());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel carregar o acompanhamento do dia.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const intervalId = window.setInterval(() => void load(), LIVE_STATUS_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setSelectedPromoterId((current) => {
      if (current && items.some((item) => item.promoter.id === current)) {
        return current;
      }

      return items.find((item) => item.activeVisit || item.status === "online")?.promoter.id ?? items[0]?.promoter.id ?? null;
    });
  }, [items]);

  const selectedPromoter = useMemo(
    () => items.find((item) => item.promoter.id === selectedPromoterId) ?? null,
    [items, selectedPromoterId]
  );

  const onlineCount = items.filter((item) => item.status === "online").length;
  const activeCount = items.filter((item) => item.activeVisit).length;
  const completedVisitsToday = items.reduce((total, item) => total + item.today.completedVisits, 0);
  const photoCountToday = items.reduce((total, item) => total + item.today.photoCount, 0);
  const distanceToday = items.reduce((total, item) => total + item.today.distanceKm, 0);

  return (
    <section>
      <PageHeader
        title="Acompanhamento do dia"
        subtitle="Painel operacional da jornada dos promotores, com roteiro processado, eventos do dia e ultimo ponto recebido."
        action={
          <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </button>
        }
      />

      {message ? <div className="notice notice-warning">{message}</div> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Promotores conectados" value={onlineCount} foot="Sinal valido dentro da janela ativa." icon={Wifi} tone="success" />
        <MetricCard label="Em atendimento" value={activeCount} foot="Visitas abertas neste momento." icon={Clock3} tone="brand" />
        <MetricCard label="Visitas concluidas" value={completedVisitsToday} foot="Atendimentos finalizados no dia." icon={CheckCircle2} tone="success" />
        <MetricCard label="Fotos do dia" value={photoCountToday} foot="Evidencias enviadas pelo campo." icon={Camera} tone="brand" />
        <MetricCard
          label="Deslocamento"
          value={formatDistance(distanceToday)}
          foot={lastRefresh ? `Ultima leitura em ${formatDateTime(lastRefresh.toISOString())}` : "Atualizacao automatica a cada 15 segundos."}
          icon={Navigation}
          tone="warning"
        />
      </div>

      {selectedPromoter ? (
        <div className="mb-5 overflow-hidden rounded-[1.6rem] border border-white/70 bg-navy text-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
          <div className="relative overflow-hidden p-5 sm:p-6">
            <div className="pointer-events-none absolute right-[-7rem] top-[-8rem] h-80 w-80 rounded-full bg-brand/30 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-8rem] left-[18%] h-80 w-80 rounded-full bg-execution/18 blur-3xl" />

            <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-white/10 text-2xl font-black text-white ring-1 ring-white/10">
                    {promoterInitials(selectedPromoter.promoter.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100">
                        Jornada acompanhada
                      </span>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${statusStyles[selectedPromoter.status]}`}>
                        {statusLabels[selectedPromoter.status]}
                      </span>
                    </div>
                    <div className="mt-3 font-mono text-xs font-black tracking-[0.16em] text-blue-200">
                      {promoterCode(selectedPromoter.promoter.code)}
                    </div>
                    <h2 className="mt-1 max-w-3xl font-display text-2xl font-black tracking-tight text-white sm:text-3xl">
                      {selectedPromoter.promoter.name}
                    </h2>
                    <p className="mt-2 text-sm font-semibold text-white/70">
                      Supervisor: {selectedPromoter.promoter.supervisorName ?? "Nao vinculado"} | {selectedPromoter.promoter.email}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">
                  <CommandMetric label="Sinal atual" value={minutesAgo(selectedPromoter.today.lastSignalAt)} />
                  <CommandMetric label="No cliente" value={formatDuration(selectedPromoter.today.serviceMinutes)} />
                  <CommandMetric label="Fotos" value={String(selectedPromoter.today.photoCount)} />
                  <CommandMetric label="Distancia" value={formatDistance(selectedPromoter.today.distanceKm)} />
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">Cobertura do roteiro</div>
                    <div className="mt-2 text-2xl font-black text-white">{routeProgress(selectedPromoter)}%</div>
                  </div>
                  <Route className="h-6 w-6 text-execution" />
                </div>

                <div className="mt-4 h-2 rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-brand to-execution"
                    style={{ width: `${routeProgress(selectedPromoter)}%` }}
                  />
                </div>

                <div className="mt-4 space-y-3">
                  <OverlayInfo
                    label="Roteiro do dia"
                    value={selectedPromoter.routeOfDay?.name ?? "Sem roteiro liberado"}
                    helper={
                      selectedPromoter.routeOfDay
                        ? `${selectedPromoter.today.completedRouteClients}/${selectedPromoter.today.routeClients} cliente(s) processados`
                        : "Nenhum roteiro publicado para hoje"
                    }
                  />
                  <OverlayInfo
                    label="Atendimento atual"
                    value={
                      selectedPromoter.activeVisit
                        ? `${selectedPromoter.activeVisit.clientName} desde ${formatClock(selectedPromoter.activeVisit.startedAt)}`
                        : "Sem atendimento em andamento"
                    }
                    helper={selectedPromoter.activeVisit?.routeName ?? "Aguardando proximo passo operacional"}
                  />
                  <OverlayInfo
                    label="Proximo cliente"
                    value={selectedPromoter.routeOfDay?.nextClientName ?? "Sem cliente pendente"}
                    helper={`Primeiro sinal ${formatClock(selectedPromoter.today.firstSignalAt)} | ultimo sinal ${formatClock(selectedPromoter.today.lastSignalAt)}`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <div className="table-wrap">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Equipe em campo</h2>
              <p className="panel-subtitle">Selecione um promotor para abrir a jornada detalhada do dia.</p>
            </div>
            <span className="rounded-full bg-field px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
              {items.length} promotor(es)
            </span>
          </div>

          <div className="max-h-[900px] overflow-auto">
            {items.length === 0 ? (
              <div className="p-8 text-center text-sm font-semibold text-stone-500">Nenhum promotor ativo encontrado para hoje.</div>
            ) : (
              <div className="space-y-3 p-4">
                {items.map((item) => {
                  const progress = routeProgress(item);
                  return (
                    <button
                      key={item.promoter.id}
                      type="button"
                      onClick={() => setSelectedPromoterId(item.promoter.id)}
                      className={`w-full rounded-[1.35rem] border p-4 text-left transition ${
                        selectedPromoter?.promoter.id === item.promoter.id
                          ? "border-brand bg-blue-50/70 shadow-sm shadow-brand/10"
                          : "border-line bg-white hover:border-brand/30 hover:bg-field"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-navy text-sm font-black text-white">
                          {promoterInitials(item.promoter.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-mono text-[11px] font-black tracking-[0.12em] text-brand">{promoterCode(item.promoter.code)}</div>
                              <div className="mt-1 text-sm font-black text-ink">{item.promoter.name}</div>
                              <div className="truncate text-xs font-semibold text-slateText">{item.promoter.supervisorName ?? "Sem supervisor"}</div>
                            </div>
                            <span className={`inline-flex h-7 items-center rounded-full px-3 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${statusStyles[item.status]}`}>
                              {statusLabels[item.status]}
                            </span>
                          </div>

                          <div className="mt-3 rounded-2xl bg-field/90 px-3 py-2">
                            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">Agora</div>
                            <div className="mt-1 truncate text-sm font-black text-ink">
                              {item.activeVisit?.clientName ?? item.routeOfDay?.nextClientName ?? "Sem cliente em andamento"}
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-slateText">
                              <span>Roteiro processado</span>
                              <span>{progress}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-line">
                              <div className="h-2 rounded-full bg-gradient-to-r from-brand to-execution" style={{ width: `${progress}%` }} />
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <MiniMetric label="Concluidas" value={item.today.completedVisits} />
                            <MiniMetric label="Fotos" value={item.today.photoCount} />
                            <MiniMetric label="Sinal" value={minutesAgo(item.today.lastSignalAt)} compact />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="surface-card">
          <div className="panel-header -mx-5 -mt-5 mb-5 rounded-t-[1.35rem]">
            <div>
              <h2 className="panel-title">Linha do tempo do turno</h2>
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
                <SummaryCard label="Ultimo sinal" value={minutesAgo(selectedPromoter.today.lastSignalAt)} detail={formatDateTime(selectedPromoter.today.lastSignalAt)} />
                <SummaryCard label="Em cliente" value={formatDuration(selectedPromoter.today.serviceMinutes)} detail="Tempo acumulado em atendimento" />
                <SummaryCard
                  label="Roteiro processado"
                  value={`${selectedPromoter.today.completedRouteClients}/${selectedPromoter.today.routeClients}`}
                  detail="Clientes concluidos no roteiro do dia"
                />
                <SummaryCard label="Sinais recebidos" value={String(selectedPromoter.today.signalCount)} detail="Leituras de localizacao recebidas hoje" />
              </div>

              <div className="rounded-[28px] border border-line bg-field/70 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slateText">Ocorrencias do dia</div>
                    <h3 className="mt-2 text-xl font-black text-ink">Eventos operacionais</h3>
                  </div>
                  <div className="rounded-2xl border border-line bg-white px-3 py-2 text-right text-xs font-semibold text-slateText">
                    <div>Primeiro sinal: {formatClock(selectedPromoter.today.firstSignalAt)}</div>
                    <div>Ultimo sinal: {formatClock(selectedPromoter.today.lastSignalAt)}</div>
                  </div>
                </div>

                {selectedPromoter.timeline.length > 0 ? (
                  <div className="mt-5 space-y-4">
                    {selectedPromoter.timeline.map((event, index) => (
                      <TimelineEntry key={event.id} event={event} last={index === selectedPromoter.timeline.length - 1} />
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-3xl border border-dashed border-line bg-white p-6 text-sm font-semibold text-stone-500">
                    Nenhum evento operacional foi registrado para este promotor no dia.
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

        <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <div className="surface-card">
            <div className="panel-header -mx-5 -mt-5 mb-5 rounded-t-[1.35rem]">
              <div>
                <h2 className="panel-title">Resumo da jornada</h2>
                <p className="panel-subtitle">Leitura rapida do roteiro, cliente atual e sinais operacionais.</p>
              </div>
            </div>

            {selectedPromoter ? (
              <div className="space-y-4">
                <div className="rounded-3xl bg-navy p-5 text-white">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/55">Promotor</div>
                      <div className="mt-2 text-2xl font-black">{selectedPromoter.promoter.name}</div>
                      <div className="mt-1 text-sm font-semibold text-white/70">{selectedPromoter.promoter.email}</div>
                    </div>
                    <UserRound className="h-6 w-6 text-blue-200" />
                  </div>
                  <div className="mt-4 inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-white">
                    {statusLabels[selectedPromoter.status]}
                  </div>
                </div>

                <InfoRow label="Supervisor" value={selectedPromoter.promoter.supervisorName ?? "Nao vinculado"} />
                <InfoRow label="Roteiro do dia" value={selectedPromoter.routeOfDay?.name ?? "Sem roteiro liberado"} />
                <InfoRow
                  label="Proximo cliente"
                  value={selectedPromoter.routeOfDay?.nextClientName ?? selectedPromoter.activeVisit?.clientName ?? "Sem cliente pendente"}
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
              <div className="p-8 text-sm font-semibold text-stone-500">Nenhum promotor selecionado.</div>
            )}
          </div>

          <div className="surface-card overflow-hidden p-0">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Ultimo ponto no mapa</h2>
                <p className="panel-subtitle">Mapa de apoio com a ultima localizacao recebida no dia.</p>
              </div>
              {selectedPromoter?.location ? (
                <a className="secondary-button h-10" href={mapsUrl(selectedPromoter.location)} target="_blank" rel="noreferrer">
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
                    GPS recebido em {formatDateTime(selectedPromoter.location.capturedAt)}
                  </div>
                  <div className="rounded-2xl bg-field px-3 py-3 text-xs font-semibold text-slateText">
                    <div>
                      Coordenadas: {selectedPromoter.location.latitude?.toFixed(6)}, {selectedPromoter.location.longitude?.toFixed(6)}
                    </div>
                    <div className="mt-1">Origem: {selectedPromoter.location.source}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid min-h-[320px] place-items-center border-t border-line px-6 text-center">
                <div className="max-w-xs">
                  <LocateFixed className="mx-auto h-10 w-10 text-stone-400" />
                  <h3 className="mt-4 text-lg font-black text-ink">Sem localizacao recebida</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-stone-500">
                    O mapa aparece quando o promotor abre o aplicativo e envia um sinal durante jornada autorizada.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  foot,
  icon: Icon,
  tone
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
    warning: "bg-amber-50 text-amber-700"
  }[tone];

  return (
    <div className="metric-card">
      <div className="relative z-[1] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">{label}</div>
          <div className="mt-3 font-display text-3xl font-bold text-ink">{value}</div>
        </div>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="relative z-[1] mt-2 text-xs font-bold leading-5 text-slateText">{foot}</div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  compact = false
}: {
  label: string;
  value: number | string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white px-2 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slateText">{label}</div>
      <div className={`mt-1 font-display font-black text-ink ${compact ? "text-sm" : "text-lg"}`}>{value}</div>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-3xl border border-line bg-white p-4 shadow-sm shadow-slate-900/5">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">{label}</div>
      <div className="mt-2 text-2xl font-black text-ink">{value}</div>
      <div className="mt-2 text-xs font-semibold leading-5 text-slateText">{detail}</div>
    </div>
  );
}

function CommandMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">{label}</div>
      <div className="mt-1 truncate text-lg font-black text-white">{value}</div>
    </div>
  );
}

function OverlayInfo({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">{label}</div>
      <div className="mt-1 text-sm font-black text-white">{value}</div>
      <div className="mt-1 text-xs font-semibold text-white/55">{helper}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">{label}</div>
      <div className="mt-1 text-sm font-black text-ink">{value}</div>
    </div>
  );
}

function TimelineEntry({
  event,
  last
}: {
  event: LivePromoter["timeline"][number];
  last: boolean;
}) {
  const Icon = timelineIcon(event.kind);

  return (
    <div className="relative pl-14">
      {!last ? <div className="absolute left-[1.05rem] top-11 h-[calc(100%+0.5rem)] w-px bg-line" /> : null}
      <div className={`absolute left-0 top-0 grid h-9 w-9 place-items-center rounded-2xl ring-1 ${toneStyles[event.tone]}`}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="rounded-[1.35rem] border border-line bg-white p-4 shadow-sm shadow-slate-900/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slateText">{formatClock(event.occurredAt)}</div>
            <div className="mt-1 text-base font-black text-ink">{event.title}</div>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${toneStyles[event.tone]}`}>
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

        <p className="mt-2 text-sm font-semibold leading-6 text-slateText">{event.description}</p>

        {event.photoUrls && event.photoUrls.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {event.photoUrls.map((url, index) => (
              <img
                key={`${event.id}-${index}`}
                src={url}
                alt={`Evidencia ${index + 1}`}
                className="h-16 w-16 rounded-2xl border border-line object-cover"
              />
            ))}
          </div>
        ) : null}

        {typeof event.latitude === "number" && typeof event.longitude === "number" ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-field px-3 py-1.5 text-xs font-black text-ink">
            <Navigation className="h-3.5 w-3.5 text-brand" />
            {event.latitude.toFixed(6)}, {event.longitude.toFixed(6)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

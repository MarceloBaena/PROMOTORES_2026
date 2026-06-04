import { useEffect, useMemo, useState } from "react";
import { ExternalLink, LocateFixed, MapPinned, RefreshCcw, RadioTower, UserRound } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { apiJson } from "../lib/api";

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
  location?: {
    latitude: number | null;
    longitude: number | null;
    accuracyMeters?: number | null;
    capturedAt: string;
    receivedAt: string;
    source: string;
  } | null;
  status: "online" | "stale" | "offline";
}

const statusStyles = {
  online: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  stale: "bg-amber-50 text-amber-800 ring-amber-200",
  offline: "bg-stone-100 text-stone-600 ring-stone-200"
};

const statusLabels = {
  online: "Online",
  stale: "Sem sinal recente",
  offline: "Offline"
};

function promoterCode(code: number) {
  return `PRO-${String(code).padStart(4, "0")}`;
}

function formatTime(value?: string | null) {
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

function buildBounds(items: LivePromoter[]) {
  const located = items
    .map((item) => item.location)
    .filter((location): location is NonNullable<LivePromoter["location"]> =>
      typeof location?.latitude === "number" && typeof location.longitude === "number"
    );

  if (located.length === 0) {
    return null;
  }

  const latitudes = located.map((location) => location.latitude as number);
  const longitudes = located.map((location) => location.longitude as number);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latPadding = Math.max((maxLat - minLat) * 0.18, 0.01);
  const lngPadding = Math.max((maxLng - minLng) * 0.18, 0.01);

  return {
    minLat: minLat - latPadding,
    maxLat: maxLat + latPadding,
    minLng: minLng - lngPadding,
    maxLng: maxLng + lngPadding
  };
}

function markerPosition(location: NonNullable<LivePromoter["location"]>, bounds: NonNullable<ReturnType<typeof buildBounds>>) {
  const latitude = location.latitude ?? bounds.minLat;
  const longitude = location.longitude ?? bounds.minLng;
  const width = bounds.maxLng - bounds.minLng || 1;
  const height = bounds.maxLat - bounds.minLat || 1;

  return {
    left: `${Math.min(96, Math.max(4, ((longitude - bounds.minLng) / width) * 100))}%`,
    top: `${Math.min(92, Math.max(8, (1 - (latitude - bounds.minLat) / height) * 100))}%`
  };
}

function mapsUrl(location: NonNullable<LivePromoter["location"]>) {
  return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

export function LiveMapPage() {
  const [items, setItems] = useState<LivePromoter[]>([]);
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
      setMessage(error instanceof Error ? error.message : "Nao foi possivel carregar o mapa.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const intervalId = window.setInterval(() => void load(), 15000);

    return () => window.clearInterval(intervalId);
  }, []);

  const bounds = useMemo(() => buildBounds(items), [items]);
  const locatedItems = items.filter((item) => item.location?.latitude !== null && item.location?.longitude !== null);
  const onlineCount = items.filter((item) => item.status === "online").length;
  const activeCount = items.filter((item) => item.activeVisit).length;

  return (
    <section>
      <PageHeader
        title="Mapa ao vivo"
        subtitle="Visualize a ultima posicao enviada por promotores durante visitas em andamento."
        action={
          <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </button>
        }
      />

      {message ? <div className="notice notice-warning">{message}</div> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="metric-card">
          <div className="relative z-[1] text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Promotores online</div>
          <div className="relative z-[1] mt-3 font-display text-3xl font-bold">{onlineCount}</div>
        </div>
        <div className="metric-card">
          <div className="relative z-[1] text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Em atendimento</div>
          <div className="relative z-[1] mt-3 font-display text-3xl font-bold">{activeCount}</div>
        </div>
        <div className="metric-card">
          <div className="relative z-[1] text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Ultima atualizacao</div>
          <div className="relative z-[1] mt-3 font-display text-xl font-bold">{lastRefresh ? formatTime(lastRefresh.toISOString()) : "-"}</div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="surface-card overflow-hidden p-0">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Mapa operacional</h2>
              <p className="panel-subtitle">Atualizacao automatica a cada 15 segundos.</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
              <RadioTower className="h-4 w-4" />
              Ao vivo
            </span>
          </div>

          <div className="relative min-h-[560px] overflow-hidden bg-[#dfe8df]">
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(17,25,23,0.06)_1px,transparent_1px),linear-gradient(rgba(17,25,23,0.06)_1px,transparent_1px)] bg-[size:54px_54px]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_28%,rgba(37,111,75,0.18),transparent_22rem),radial-gradient(circle_at_74%_70%,rgba(54,95,120,0.18),transparent_20rem)]" />
            <div className="absolute left-8 top-8 rounded-2xl border border-white/70 bg-white/85 px-4 py-3 shadow-lg backdrop-blur">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-stone-500">Camada</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-bold text-ink">
                <MapPinned className="h-4 w-4 text-moss" />
                Promotores em atendimento
              </div>
            </div>

            {bounds
              ? locatedItems.map((item) => {
                  const location = item.location;

                  if (!location) {
                    return null;
                  }

                  const position = markerPosition(location, bounds);

                  return (
                    <a
                      key={item.promoter.id}
                      href={mapsUrl(location)}
                      target="_blank"
                      rel="noreferrer"
                      className="group absolute z-[2] -translate-x-1/2 -translate-y-1/2"
                      style={position}
                      title={`${promoterCode(item.promoter.code)} - ${item.promoter.name}`}
                    >
                      <span className={`absolute inset-0 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full ${item.status === "online" ? "bg-emerald-400/25" : "bg-amber-400/25"} animate-ping`} />
                      <span className={`grid h-12 w-12 place-items-center rounded-2xl border-2 border-white text-white shadow-xl transition group-hover:scale-110 ${item.status === "online" ? "bg-moss" : "bg-saffron"}`}>
                        <UserRound className="h-5 w-5" />
                      </span>
                      <span className="absolute left-1/2 top-14 hidden min-w-44 -translate-x-1/2 rounded-xl border border-line bg-white px-3 py-2 text-xs font-bold text-ink shadow-xl group-hover:block">
                        {promoterCode(item.promoter.code)} - {item.promoter.name}
                      </span>
                    </a>
                  );
                })
              : (
                <div className="absolute inset-0 grid place-items-center px-6 text-center">
                  <div className="max-w-md rounded-3xl border border-white/80 bg-white/86 p-7 shadow-xl backdrop-blur">
                    <LocateFixed className="mx-auto h-10 w-10 text-stone-400" />
                    <h3 className="mt-4 font-display text-2xl font-bold text-ink">Nenhuma posicao recebida</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-stone-500">
                      O mapa sera preenchido quando um promotor iniciar uma visita e o app enviar a localizacao autorizada.
                    </p>
                  </div>
                </div>
              )}
          </div>
        </div>

        <div className="table-wrap">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Sinais dos promotores</h2>
              <p className="panel-subtitle">Ultima localizacao registrada por promotor ativo.</p>
            </div>
          </div>
          <div className="max-h-[630px] overflow-auto">
            {items.map((item) => (
              <div key={item.promoter.id} className="border-b border-line/70 p-4 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-black tracking-[0.12em] text-moss">{promoterCode(item.promoter.code)}</div>
                    <div className="mt-1 truncate font-display text-lg font-bold text-ink">{item.promoter.name}</div>
                    <div className="truncate text-xs font-semibold text-stone-500">{item.promoter.supervisorName ?? "Sem supervisor"}</div>
                  </div>
                  <span className={`inline-flex h-7 items-center rounded-full px-3 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${statusStyles[item.status]}`}>
                    {statusLabels[item.status]}
                  </span>
                </div>

                <div className="mt-4 rounded-2xl bg-field p-3 text-sm">
                  <div className="font-bold text-graphite">{item.activeVisit?.clientName ?? "Sem visita em andamento"}</div>
                  <div className="mt-1 text-xs font-semibold text-stone-500">
                    Ultimo sinal: {minutesAgo(item.location?.capturedAt)} · {formatTime(item.location?.capturedAt)}
                  </div>
                </div>

                {item.location ? (
                  <a
                    className="secondary-button mt-3 h-10 w-full"
                    href={mapsUrl(item.location)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir no mapa
                  </a>
                ) : null}
              </div>
            ))}

            {items.length === 0 ? (
              <div className="p-8 text-center text-sm font-semibold text-stone-500">
                Nenhum promotor ativo encontrado.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

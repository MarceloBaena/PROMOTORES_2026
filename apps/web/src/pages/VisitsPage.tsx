import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Clock, Eye, FileText, MapPin, RefreshCw, UserRound } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { API_BASE_URL, apiJson } from "../lib/api";
import { auditTypeLabel } from "../lib/labels";

interface VisitPhoto {
  id: string;
  type: "checkin" | "before" | "after" | "occurrence_extra";
  url: string;
  metadata?: {
    capturedAt?: string;
    gpsLatitude?: number | string | null;
    gpsLongitude?: number | string | null;
    contentType?: string;
    source?: string;
  } | null;
  createdAt: string;
}

interface Visit {
  id: string;
  status: string;
  notes?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  gpsLatitude?: number | string | null;
  gpsLongitude?: number | string | null;
  client: { name: string; code?: string | null; address?: string | null; city?: string | null; state?: string | null };
  promoter?: { code?: number; user?: { name?: string; email?: string } };
  route?: { name?: string | null; scheduledDate?: string | null } | null;
  photos: VisitPhoto[];
  auditFlags?: Array<{ id: string; type: string; severity: string; resolved: boolean }>;
  createdAt: string;
}

const photoLabels: Record<VisitPhoto["type"], string> = {
  checkin: "Check-in",
  before: "Foto antes",
  after: "Foto depois",
  occurrence_extra: "Ocorrencia extra"
};

function promoterLabel(promoter?: Visit["promoter"]) {
  if (!promoter) {
    return "-";
  }

  const code = Number(promoter.code);
  const formattedCode = Number.isFinite(code) && code > 0 ? `PRO-${String(code).padStart(4, "0")}` : null;
  const name = promoter.user?.name ?? "Sem nome";

  return formattedCode ? `${formattedCode} - ${name}` : name;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR");
}

function formatOnlyDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
}

function formatOnlyTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleTimeString("pt-BR");
}

function coordinateNumber(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function validGpsPair(latitude?: string | number | null, longitude?: string | number | null) {
  const lat = coordinateNumber(latitude);
  const lng = coordinateNumber(longitude);

  if (lat === null || lng === null || (lat === 0 && lng === 0)) {
    return null;
  }

  return { latitude: lat, longitude: lng };
}

function photoEvidence(photo: VisitPhoto, visit: Visit) {
  const capturedAt = photo.metadata?.capturedAt ?? photo.createdAt;
  const photoGps = validGpsPair(photo.metadata?.gpsLatitude, photo.metadata?.gpsLongitude);
  const visitGps = validGpsPair(visit.gpsLatitude, visit.gpsLongitude);

  return {
    capturedAt,
    gpsLabel: photoGps ? "GPS da foto" : visitGps ? "GPS da visita" : "GPS",
    gpsValue: photoGps
      ? `${photoGps.latitude.toFixed(6)}, ${photoGps.longitude.toFixed(6)}`
      : visitGps
        ? `${visitGps.latitude.toFixed(6)}, ${visitGps.longitude.toFixed(6)}`
        : "Nao capturado pelo aparelho"
  };
}

function visitGpsText(visit: Visit) {
  const gps = validGpsPair(visit.gpsLatitude, visit.gpsLongitude);
  return gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : "GPS nao capturado";
}

function photoUrl(url: string) {
  if (/^(https?:|data:)/i.test(url)) {
    return url;
  }

  return `${API_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

function hasRequiredPhotos(visit: Visit) {
  const types = new Set(visit.photos.map((photo) => photo.type));
  return types.has("checkin") && types.has("before") && types.has("after");
}

function visitAddress(visit: Visit) {
  const city = visit.client.city ? `${visit.client.city}${visit.client.state ? `/${visit.client.state}` : ""}` : null;
  return [visit.client.address, city].filter(Boolean).join(" | ") || "Endereco nao informado";
}

export function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedVisit = useMemo(
    () => visits.find((visit) => visit.id === selectedVisitId) ?? visits[0] ?? null,
    [selectedVisitId, visits]
  );

  const completedCount = visits.filter((visit) => visit.status === "completed").length;
  const inProgressCount = visits.filter((visit) => visit.status === "in_progress").length;
  const evidencesReadyCount = visits.filter((visit) => hasRequiredPhotos(visit)).length;

  async function load(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
    }
    setMessage(null);

    try {
      const response = await apiJson<{ data: Visit[] }>("/visits");
      setVisits(response.data);
      setSelectedVisitId((current) => {
        if (current && response.data.some((visit) => visit.id === current)) {
          return current;
        }

        return response.data[0]?.id ?? null;
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel carregar visitas.");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void load();
    const intervalId = window.setInterval(() => {
      void load({ silent: true });
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  async function completeVisit(visit: Visit) {
    if (!hasRequiredPhotos(visit)) {
      setMessage("Nao e possivel concluir manualmente sem check-in, foto antes e foto depois sincronizadas.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      await apiJson(`/visits/${visit.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: "completed",
          finishedAt: visit.finishedAt ?? new Date().toISOString()
        })
      });
      await load();
      setMessage("Visita marcada como concluida.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel concluir a visita.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <PageHeader
        title="Visitas"
        subtitle="Painel operacional dos atendimentos enviados pelo aplicativo, com evidencias, GPS e auditoria."
        action={(
          <button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        )}
      />

      {message ? <div className="notice notice-warning">{message}</div> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OperationalMetric label="Visitas no painel" value={visits.length} helper="Atendimentos recebidos da operacao mobile." />
        <OperationalMetric label="Concluidas" value={completedCount} helper="Visitas finalizadas e registradas no sistema." />
        <OperationalMetric label="Em andamento" value={inProgressCount} helper="Atendimentos ainda abertos no aplicativo." />
        <OperationalMetric label="Com evidencias" value={evidencesReadyCount} helper="Check-in, foto antes e foto depois presentes." />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="table-wrap">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Fila operacional de visitas</h2>
              <p className="panel-subtitle">Clique em uma visita para abrir os detalhes, evidencias e auditorias do atendimento.</p>
            </div>
            <span className="rounded-full bg-field px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
              {visits.length} registro(s)
            </span>
          </div>

          <div className="space-y-3 p-4">
            {visits.map((visit) => {
              const isSelected = visit.id === selectedVisit?.id;

              return (
                <button
                  key={visit.id}
                  type="button"
                  className={`w-full rounded-[1.35rem] border p-4 text-left transition ${
                    isSelected
                      ? "border-brand bg-blue-50/70 shadow-sm shadow-brand/10"
                      : "border-line bg-white hover:border-brand/30 hover:bg-field"
                  }`}
                  onClick={() => setSelectedVisitId(visit.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-ink">{visit.client.name}</div>
                      <div className="mt-1 text-xs font-semibold text-slateText">{visit.route?.name ?? "Sem rota vinculada"}</div>
                      <div className="mt-2 text-xs font-semibold text-slateText">{visitAddress(visit)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill value={visit.status} />
                      <span className="icon-button h-10 w-10 text-moss">
                        <Eye className="h-4 w-4" />
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <MiniVisitInfo label="Promotor" value={promoterLabel(visit.promoter)} />
                    <MiniVisitInfo label="Fotos" value={`${visit.photos.length} evidencia(s)`} />
                    <MiniVisitInfo label="Criada em" value={formatDate(visit.createdAt)} />
                  </div>
                </button>
              );
            })}

            {visits.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-white px-4 py-8 text-center text-sm font-semibold text-stone-500">
                Nenhuma visita encontrada. Sincronize o aplicativo para enviar os atendimentos.
              </div>
            ) : null}
          </div>
        </div>

        <aside className="panel overflow-hidden xl:sticky xl:top-20 xl:self-start">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Detalhe da visita</h2>
              <p className="panel-subtitle">Dados recebidos do atendimento no aplicativo.</p>
            </div>
          </div>

          {!selectedVisit ? (
            <div className="p-5 text-sm font-semibold text-stone-500">Selecione uma visita para consultar.</div>
          ) : (
            <div className="space-y-4 p-5">
              <div className="rounded-[1.35rem] bg-navy p-4 text-white">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-white/55">Cliente</div>
                <div className="mt-2 font-display text-2xl font-black">{selectedVisit.client.name}</div>
                <div className="mt-2 text-sm font-semibold text-white/75">{visitAddress(selectedVisit)}</div>
                <div className="mt-3"><StatusPill value={selectedVisit.status} /></div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <InfoCard icon={<UserRound className="h-4 w-4" />} label="Promotor" value={promoterLabel(selectedVisit.promoter)} />
                <InfoCard icon={<Clock className="h-4 w-4" />} label="Inicio" value={formatDate(selectedVisit.startedAt)} />
                <InfoCard icon={<Clock className="h-4 w-4" />} label="Fim" value={formatDate(selectedVisit.finishedAt)} />
                <InfoCard icon={<MapPin className="h-4 w-4" />} label="GPS da visita" value={visitGpsText(selectedVisit)} />
              </div>

              <div className="surface-card">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg font-black text-ink">Evidencias</h3>
                    <p className="text-xs font-semibold text-stone-500">Fotos sincronizadas pelo aplicativo.</p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-graphite">{selectedVisit.photos.length} foto(s)</span>
                </div>

                <div className="space-y-3">
                  {selectedVisit.photos.map((photo) => {
                    const evidence = photoEvidence(photo, selectedVisit);

                    return (
                      <div key={photo.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                        <img className="h-44 w-full object-cover" src={photoUrl(photo.url)} alt={photoLabels[photo.type]} />
                        <div className="space-y-2 p-3 text-sm">
                          <div className="font-black text-ink">{photoLabels[photo.type]}</div>
                          <div className="grid gap-2 rounded-xl bg-muted/50 p-3 text-xs font-semibold text-stone-600">
                            <div><span className="font-black text-ink">Data:</span> {formatOnlyDate(evidence.capturedAt)}</div>
                            <div><span className="font-black text-ink">Hora:</span> {formatOnlyTime(evidence.capturedAt)}</div>
                            <div><span className="font-black text-ink">{evidence.gpsLabel}:</span> {evidence.gpsValue}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {selectedVisit.photos.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line bg-muted/40 p-4 text-sm font-semibold text-stone-500">
                      Nenhuma foto chegou para esta visita ainda.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="surface-card">
                <div className="flex items-center gap-2 font-display text-lg font-black text-ink">
                  <FileText className="h-4 w-4" />
                  Observacoes
                </div>
                <p className="mt-2 text-sm font-semibold text-stone-600">{selectedVisit.notes || "Sem observacoes registradas."}</p>
              </div>

              {selectedVisit.auditFlags && selectedVisit.auditFlags.length > 0 ? (
                <div className="surface-card">
                  <h3 className="font-display text-lg font-black text-ink">Auditoria</h3>
                  <div className="mt-3 space-y-2">
                    {selectedVisit.auditFlags.map((flag) => (
                      <div key={flag.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2 text-sm font-bold">
                        <span>{auditTypeLabel(flag.type)}</span>
                        <StatusPill value={flag.severity} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedVisit.status !== "completed" ? (
                <button className="primary-button w-full" type="button" disabled={loading} onClick={() => void completeVisit(selectedVisit)}>
                  <CheckCircle2 className="h-4 w-4" />
                  Marcar concluida
                </button>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function OperationalMetric({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="metric-card">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">{label}</div>
      <div className="mt-3 font-display text-3xl font-bold text-ink">{value}</div>
      <div className="mt-2 text-xs font-bold leading-5 text-slateText">{helper}</div>
    </div>
  );
}

function MiniVisitInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-3 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">{label}</div>
      <div className="mt-1 text-xs font-bold leading-5 text-ink">{value}</div>
    </div>
  );
}

function InfoCard(props: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-3">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-stone-500">
        {props.icon}
        {props.label}
      </div>
      <div className="mt-2 text-sm font-bold text-ink">{props.value}</div>
    </div>
  );
}

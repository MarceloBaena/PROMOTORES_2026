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
  occurrence_extra: "Ocorrência extra"
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

  return new Date(value).toLocaleString("pt-BR");
}

function coordinate(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toFixed(6) : String(value);
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

export function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedVisit = useMemo(
    () => visits.find((visit) => visit.id === selectedVisitId) ?? visits[0] ?? null,
    [selectedVisitId, visits]
  );

  async function load() {
    setLoading(true);
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
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar visitas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function completeVisit(visit: Visit) {
    if (!hasRequiredPhotos(visit)) {
      setMessage("Não é possível concluir manualmente sem check-in, foto antes e foto depois sincronizadas.");
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
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a visita.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <PageHeader
        title="Visitas"
        subtitle="Consulte atendimentos enviados pelo aplicativo: situação, horários, fotos, GPS e auditoria."
        action={(
          <button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        )}
      />

      {message ? <div className="notice notice-warning">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Promotor</th>
                  <th>Situação</th>
                  <th>Fotos</th>
                  <th>Criada em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => (
                  <tr key={visit.id} className={visit.id === selectedVisit?.id ? "bg-skywash/80" : undefined}>
                    <td className="font-bold">
                      <div>{visit.client.name}</div>
                      <div className="mt-1 text-xs font-semibold text-stone-500">{visit.route?.name ?? "Sem rota vinculada"}</div>
                    </td>
                    <td>{promoterLabel(visit.promoter)}</td>
                    <td><StatusPill value={visit.status} /></td>
                    <td>
                      <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-black text-graphite">
                        <Camera className="h-3.5 w-3.5" />
                        {visit.photos.length}
                      </span>
                    </td>
                    <td>{formatDate(visit.createdAt)}</td>
                    <td>
                      <button className="icon-button text-moss" type="button" title="Ver detalhes" onClick={() => setSelectedVisitId(visit.id)}>
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {visits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-stone-500">
                      Nenhuma visita encontrada. Sincronize o APK para enviar os atendimentos.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="panel overflow-hidden xl:sticky xl:top-20 xl:self-start">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Detalhe da visita</h2>
              <p className="panel-subtitle">Dados recebidos do atendimento no aplicativo</p>
            </div>
          </div>

          {!selectedVisit ? (
            <div className="p-5 text-sm font-semibold text-stone-500">Selecione uma visita para consultar.</div>
          ) : (
            <div className="space-y-4 p-5">
              <div className="rounded-2xl bg-forest p-4 text-white">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-white/55">Cliente</div>
                <div className="mt-2 font-display text-2xl font-black">{selectedVisit.client.name}</div>
                <div className="mt-2 text-sm font-semibold text-white/75">{selectedVisit.client.address ?? "Endereço não informado"}</div>
                <div className="mt-3"><StatusPill value={selectedVisit.status} /></div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <InfoCard icon={<UserRound className="h-4 w-4" />} label="Promotor" value={promoterLabel(selectedVisit.promoter)} />
                <InfoCard icon={<Clock className="h-4 w-4" />} label="Inicio" value={formatDate(selectedVisit.startedAt)} />
                <InfoCard icon={<Clock className="h-4 w-4" />} label="Fim" value={formatDate(selectedVisit.finishedAt)} />
                <InfoCard
                  icon={<MapPin className="h-4 w-4" />}
                  label="GPS da visita"
                  value={`${coordinate(selectedVisit.gpsLatitude)}, ${coordinate(selectedVisit.gpsLongitude)}`}
                />
              </div>

              <div className="surface-card">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg font-black text-ink">Evidências</h3>
                    <p className="text-xs font-semibold text-stone-500">Fotos sincronizadas pelo aplicativo</p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-graphite">{selectedVisit.photos.length} foto(s)</span>
                </div>

                <div className="space-y-3">
                  {selectedVisit.photos.map((photo) => (
                    <div key={photo.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                      <img className="h-44 w-full object-cover" src={photoUrl(photo.url)} alt={photoLabels[photo.type]} />
                      <div className="space-y-1 p-3 text-sm">
                        <div className="font-black text-ink">{photoLabels[photo.type]}</div>
                        <div className="text-xs font-semibold text-stone-500">Capturada: {formatDate(photo.metadata?.capturedAt ?? photo.createdAt)}</div>
                        <div className="text-xs font-semibold text-stone-500">
                          GPS: {coordinate(photo.metadata?.gpsLatitude)}, {coordinate(photo.metadata?.gpsLongitude)}
                        </div>
                      </div>
                    </div>
                  ))}
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
                  Observações
                </div>
                <p className="mt-2 text-sm font-semibold text-stone-600">{selectedVisit.notes || "Sem observações registradas."}</p>
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

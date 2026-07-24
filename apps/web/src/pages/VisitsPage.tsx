import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  MapPin,
  Maximize2,
  RefreshCw,
  UserRound,
  X,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { API_BASE_URL, apiJson } from "../lib/api";
import { sortVisitEvidence } from "../lib/evidence-order";
import { auditTypeLabel } from "../lib/labels";

interface VisitPhoto {
  id: string;
  type:
    | "checkin"
    | "before"
    | "after"
    | "checkout"
    | "supplier_before"
    | "supplier_after"
    | "leaflet"
    | "gondola"
    | "display"
    | "island"
    | "promotional_material"
    | "store_extra"
    | "occurrence_extra";
  url: string;
  supplierId?: string | null;
  supplierExecutionId?: string | null;
  metadata?: {
    capturedAt?: string;
    gpsLatitude?: number | string | null;
    gpsLongitude?: number | string | null;
    contentType?: string;
    source?: string;
    categoryId?: string | null;
    categoryName?: string | null;
    activityId?: string | null;
    activityName?: string | null;
  } | null;
  supplier?: { name?: string | null; tradeName?: string | null } | null;
  supplierExecution?: {
    id?: string | null;
    supplierId?: string | null;
    supplier?: { name?: string | null; tradeName?: string | null } | null;
  } | null;
  createdAt: string;
}

interface SupplierExecution {
  id: string;
  status: string;
  deliveryReceived?: boolean | null;
  productsReplenished?: boolean | null;
  stockoutFound?: boolean | null;
  notes?: string | null;
  supplier?: { name?: string | null; tradeName?: string | null } | null;
  photos?: VisitPhoto[];
}

interface Visit {
  id: string;
  status: string;
  notes?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  gpsLatitude?: number | string | null;
  gpsLongitude?: number | string | null;
  client: {
    name: string;
    tradeName?: string | null;
    code?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  };
  promoter?: { code?: number; user?: { name?: string; email?: string } };
  route?: { name?: string | null; scheduledDate?: string | null } | null;
  photos: VisitPhoto[];
  supplierExecutions?: SupplierExecution[];
  auditFlags?: Array<{
    id: string;
    type: string;
    severity: string;
    resolved: boolean;
  }>;
  createdAt: string;
}

const photoLabels: Record<VisitPhoto["type"], string> = {
  checkin: "Check-in",
  before: "Foto antes",
  after: "Foto depois",
  checkout: "Check-out",
  supplier_before: "Fornecedor - foto antes",
  supplier_after: "Fornecedor - foto depois",
  leaflet: "Panfleto",
  gondola: "Gondola",
  display: "Display",
  island: "Ilha",
  promotional_material: "Material promocional",
  store_extra: "Foto extra da loja",
  occurrence_extra: "Ocorrencia extra",
};

function photoTitle(photo: VisitPhoto) {
  const categoryName = photo.metadata?.categoryName?.trim();
  if (categoryName) {
    return `Categoria - ${categoryName}`;
  }

  const activityName = photo.metadata?.activityName?.trim();
  if (activityName) {
    return `Atividade - ${activityName}`;
  }

  return photoLabels[photo.type];
}

function promoterLabel(promoter?: Visit["promoter"]) {
  if (!promoter) {
    return "-";
  }

  const code = Number(promoter.code);
  const formattedCode =
    Number.isFinite(code) && code > 0
      ? `PRO-${String(code).padStart(4, "0")}`
      : null;
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

function photoEvidence(photo: VisitPhoto, visit: Visit) {
  const capturedAt = photo.metadata?.capturedAt ?? photo.createdAt;
  const photoGps = validGpsPair(
    photo.metadata?.gpsLatitude,
    photo.metadata?.gpsLongitude,
  );
  const visitGps = validGpsPair(visit.gpsLatitude, visit.gpsLongitude);

  return {
    capturedAt,
    gpsLabel: photoGps ? "GPS da foto" : visitGps ? "GPS da visita" : "GPS",
    gpsValue: photoGps
      ? `${photoGps.latitude.toFixed(6)}, ${photoGps.longitude.toFixed(6)}`
      : visitGps
        ? `${visitGps.latitude.toFixed(6)}, ${visitGps.longitude.toFixed(6)}`
        : "Nao capturado pelo aparelho",
  };
}

function visitGpsText(visit: Visit) {
  const gps = validGpsPair(visit.gpsLatitude, visit.gpsLongitude);
  return gps
    ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`
    : "GPS nao capturado";
}

function photoUrl(url: string) {
  if (/^(https?:|data:)/i.test(url)) {
    return url;
  }

  return `${API_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

function booleanLabel(value?: boolean | null) {
  if (value === true) {
    return "Sim";
  }

  if (value === false) {
    return "Nao";
  }

  return "Nao informado";
}

function supplierExecutionLabel(execution: SupplierExecution) {
  return (
    execution.supplier?.tradeName || execution.supplier?.name || "Fornecedor"
  );
}

function photoSupplierLabel(photo: VisitPhoto) {
  return (
    photo.supplier?.tradeName ||
    photo.supplier?.name ||
    photo.supplierExecution?.supplier?.tradeName ||
    photo.supplierExecution?.supplier?.name ||
    null
  );
}

function clientNameBlock(client: Visit["client"]) {
  const tradeName = client.tradeName?.trim();
  return (
    <>
      <div className="text-sm font-black text-ink">{client.name}</div>
      {tradeName && tradeName !== client.name ? (
        <div className="mt-1 text-xs font-semibold text-slateText">
          Fantasia: {tradeName}
        </div>
      ) : null}
    </>
  );
}

function hasRequiredPhotos(visit: Visit) {
  const types = new Set(visit.photos.map((photo) => photo.type));
  return types.has("checkin") && types.has("before") && types.has("after");
}

function visitAddress(visit: Visit) {
  const city = visit.client.city
    ? `${visit.client.city}${visit.client.state ? `/${visit.client.state}` : ""}`
    : null;
  return (
    [visit.client.address, city].filter(Boolean).join(" | ") ||
    "Endereco nao informado"
  );
}

export function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedVisit = useMemo(
    () =>
      visits.find((visit) => visit.id === selectedVisitId) ?? visits[0] ?? null,
    [selectedVisitId, visits],
  );
  const selectedPhoto = useMemo(
    () =>
      selectedVisit?.photos.find((photo) => photo.id === selectedPhotoId) ??
      null,
    [selectedPhotoId, selectedVisit],
  );
  const selectedVisitPhotos = useMemo(
    () => (selectedVisit ? sortVisitEvidence(selectedVisit.photos) : []),
    [selectedVisit],
  );

  const completedCount = visits.filter(
    (visit) => visit.status === "completed",
  ).length;
  const inProgressCount = visits.filter(
    (visit) => visit.status === "in_progress",
  ).length;
  const evidencesReadyCount = visits.filter((visit) =>
    hasRequiredPhotos(visit),
  ).length;

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
      setMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar visitas.",
      );
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

  useEffect(() => {
    if (!selectedPhoto) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedPhotoId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPhoto]);

  async function completeVisit(visit: Visit) {
    if (!hasRequiredPhotos(visit)) {
      setMessage(
        "Nao e possivel concluir manualmente sem check-in, foto antes e foto depois sincronizadas.",
      );
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      await apiJson(`/visits/${visit.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: "completed",
          finishedAt: visit.finishedAt ?? new Date().toISOString(),
        }),
      });
      await load();
      setMessage("Visita marcada como concluida.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel concluir a visita.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <PageHeader
        title="Visitas"
        subtitle="Painel operacional dos atendimentos enviados pelo aplicativo, com evidencias, GPS e auditoria."
        action={
          <button
            className="secondary-button"
            type="button"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        }
      />

      {message ? <div className="notice notice-warning">{message}</div> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OperationalMetric
          label="Visitas no painel"
          value={visits.length}
          helper="Atendimentos recebidos da operacao mobile."
        />
        <OperationalMetric
          label="Concluidas"
          value={completedCount}
          helper="Visitas finalizadas e registradas no sistema."
        />
        <OperationalMetric
          label="Em andamento"
          value={inProgressCount}
          helper="Atendimentos ainda abertos no aplicativo."
        />
        <OperationalMetric
          label="Com evidencias"
          value={evidencesReadyCount}
          helper="Check-in, foto antes e foto depois presentes."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="table-wrap">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Fila operacional de visitas</h2>
              <p className="panel-subtitle">
                Clique em uma visita para abrir os detalhes, evidencias e
                auditorias do atendimento.
              </p>
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
                      {clientNameBlock(visit.client)}
                      <div className="mt-1 text-xs font-semibold text-slateText">
                        {visit.route?.name ?? "Sem rota vinculada"}
                      </div>
                      <div className="mt-2 text-xs font-semibold text-slateText">
                        {visitAddress(visit)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill value={visit.status} />
                      <span className="icon-button h-10 w-10 text-moss">
                        <Eye className="h-4 w-4" />
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <MiniVisitInfo
                      label="Promotor"
                      value={promoterLabel(visit.promoter)}
                    />
                    <MiniVisitInfo
                      label="Fotos"
                      value={`${visit.photos.length} evidencia(s)`}
                    />
                    <MiniVisitInfo
                      label="Criada em"
                      value={formatDate(visit.createdAt)}
                    />
                  </div>
                </button>
              );
            })}

            {visits.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-white px-4 py-8 text-center text-sm font-semibold text-stone-500">
                Nenhuma visita encontrada. Sincronize o aplicativo para enviar
                os atendimentos.
              </div>
            ) : null}
          </div>
        </div>

        <aside className="panel overflow-hidden xl:sticky xl:top-20 xl:self-start">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Detalhe da visita</h2>
              <p className="panel-subtitle">
                Dados recebidos do atendimento no aplicativo.
              </p>
            </div>
          </div>

          {!selectedVisit ? (
            <div className="p-5 text-sm font-semibold text-stone-500">
              Selecione uma visita para consultar.
            </div>
          ) : (
            <div className="space-y-4 p-5">
              <div className="rounded-[1.35rem] bg-navy p-4 text-white">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-white/55">
                  Cliente
                </div>
                <div className="mt-2 font-display text-2xl font-black">
                  {selectedVisit.client.name}
                </div>
                {selectedVisit.client.tradeName &&
                selectedVisit.client.tradeName !== selectedVisit.client.name ? (
                  <div className="mt-1 text-sm font-black text-blue-100">
                    Fantasia: {selectedVisit.client.tradeName}
                  </div>
                ) : null}
                <div className="mt-2 text-sm font-semibold text-white/75">
                  {visitAddress(selectedVisit)}
                </div>
                <div className="mt-3">
                  <StatusPill value={selectedVisit.status} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <InfoCard
                  icon={<UserRound className="h-4 w-4" />}
                  label="Promotor"
                  value={promoterLabel(selectedVisit.promoter)}
                />
                <InfoCard
                  icon={<Clock className="h-4 w-4" />}
                  label="Inicio"
                  value={formatDate(selectedVisit.startedAt)}
                />
                <InfoCard
                  icon={<Clock className="h-4 w-4" />}
                  label="Fim"
                  value={formatDate(selectedVisit.finishedAt)}
                />
                <InfoCard
                  icon={<MapPin className="h-4 w-4" />}
                  label="GPS da visita"
                  value={visitGpsText(selectedVisit)}
                />
              </div>

              <div className="surface-card">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg font-black text-ink">
                      Evidencias
                    </h3>
                    <p className="text-xs font-semibold text-stone-500">
                      Fotos sincronizadas pelo aplicativo.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-graphite">
                    {selectedVisit.photos.length} foto(s)
                  </span>
                </div>

                <div className="space-y-3">
                  {selectedVisitPhotos.map((photo) => {
                    const evidence = photoEvidence(photo, selectedVisit);

                    return (
                      <div
                        key={photo.id}
                        className="overflow-hidden rounded-2xl border border-line bg-white"
                      >
                        <button
                          type="button"
                          className="group relative block w-full overflow-hidden text-left"
                          onClick={() => setSelectedPhotoId(photo.id)}
                          aria-label={`Ampliar evidencia ${photoTitle(photo)}`}
                        >
                          <img
                            className="h-44 w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                            src={photoUrl(photo.url)}
                            alt={photoTitle(photo)}
                          />
                          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-navy/85 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-lg">
                            <Maximize2 className="h-3.5 w-3.5" />
                            Ampliar
                          </span>
                        </button>
                        <div className="space-y-2 p-3 text-sm">
                          <div className="font-black text-ink">
                            {photoTitle(photo)}
                          </div>
                          {photoSupplierLabel(photo) ? (
                            <div className="text-xs font-bold text-slateText">
                              Fornecedor: {photoSupplierLabel(photo)}
                            </div>
                          ) : null}
                          {photo.metadata?.categoryName?.trim() ? (
                            <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-brand">
                              Categoria: {photo.metadata.categoryName.trim()}
                            </div>
                          ) : null}
                          {photo.metadata?.activityName?.trim() ? (
                            <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">
                              Atividade: {photo.metadata.activityName.trim()}
                            </div>
                          ) : null}
                          <div className="grid gap-2 rounded-xl bg-muted/50 p-3 text-xs font-semibold text-stone-600">
                            <div>
                              <span className="font-black text-ink">Data:</span>{" "}
                              {formatOnlyDate(evidence.capturedAt)}
                            </div>
                            <div>
                              <span className="font-black text-ink">Hora:</span>{" "}
                              {formatOnlyTime(evidence.capturedAt)}
                            </div>
                            <div>
                              <span className="font-black text-ink">
                                {evidence.gpsLabel}:
                              </span>{" "}
                              {evidence.gpsValue}
                            </div>
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
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-display text-lg font-black text-ink">
                    <FileText className="h-4 w-4" />
                    Fornecedores atendidos
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-graphite">
                    {selectedVisit.supplierExecutions?.length ?? 0} registro(s)
                  </span>
                </div>

                <div className="mt-3 space-y-3">
                  {(selectedVisit.supplierExecutions ?? []).map((execution) => (
                    <div
                      key={execution.id}
                      className="rounded-2xl border border-line bg-white p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="font-black text-ink">
                          {supplierExecutionLabel(execution)}
                        </div>
                        <StatusPill value={execution.status} />
                      </div>
                      <div className="mt-3 grid gap-2 text-xs font-bold text-slateText sm:grid-cols-3">
                        <div className="rounded-xl bg-muted/60 p-2">
                          <span className="block text-[10px] uppercase tracking-[0.12em] text-stone-500">
                            Entrega
                          </span>
                          {booleanLabel(execution.deliveryReceived)}
                        </div>
                        <div className="rounded-xl bg-muted/60 p-2">
                          <span className="block text-[10px] uppercase tracking-[0.12em] text-stone-500">
                            Abasteceu
                          </span>
                          {booleanLabel(execution.productsReplenished)}
                        </div>
                        <div className="rounded-xl bg-muted/60 p-2">
                          <span className="block text-[10px] uppercase tracking-[0.12em] text-stone-500">
                            Ruptura
                          </span>
                          {booleanLabel(execution.stockoutFound)}
                        </div>
                      </div>
                      <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900 ring-1 ring-amber-200">
                        <span className="font-black">
                          Observacao do promotor:
                        </span>{" "}
                        {execution.notes?.trim() ||
                          "Sem observacao registrada para este fornecedor."}
                      </div>
                    </div>
                  ))}

                  {(selectedVisit.supplierExecutions ?? []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line bg-muted/40 p-4 text-sm font-semibold text-stone-500">
                      Nenhuma execucao de fornecedor chegou para esta visita.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="surface-card">
                <div className="flex items-center gap-2 font-display text-lg font-black text-ink">
                  <FileText className="h-4 w-4" />
                  Observacoes
                </div>
                <p className="mt-2 text-sm font-semibold text-stone-600">
                  {selectedVisit.notes || "Sem observacoes registradas."}
                </p>
              </div>

              {selectedVisit.auditFlags &&
              selectedVisit.auditFlags.length > 0 ? (
                <div className="surface-card">
                  <h3 className="font-display text-lg font-black text-ink">
                    Auditoria
                  </h3>
                  <div className="mt-3 space-y-2">
                    {selectedVisit.auditFlags.map((flag) => (
                      <div
                        key={flag.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2 text-sm font-bold"
                      >
                        <span>{auditTypeLabel(flag.type)}</span>
                        <StatusPill value={flag.severity} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedVisit.status !== "completed" ? (
                <button
                  className="primary-button w-full"
                  type="button"
                  disabled={loading}
                  onClick={() => void completeVisit(selectedVisit)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Marcar concluida
                </button>
              ) : null}
            </div>
          )}
        </aside>
      </div>

      {selectedVisit && selectedPhoto ? (
        <PhotoEvidenceDialog
          photo={selectedPhoto}
          visit={selectedVisit}
          onClose={() => setSelectedPhotoId(null)}
        />
      ) : null}
    </section>
  );
}

function PhotoEvidenceDialog({
  photo,
  visit,
  onClose,
}: {
  photo: VisitPhoto;
  visit: Visit;
  onClose: () => void;
}) {
  const evidence = photoEvidence(photo, visit);
  const supplier = photoSupplierLabel(photo);
  const category = photo.metadata?.categoryName?.trim();
  const activity = photo.metadata?.activityName?.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/80 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Evidencia ampliada: ${photoTitle(photo)}`}
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
            src={photoUrl(photo.url)}
            alt={photoTitle(photo)}
          />
        </div>

        <aside className="max-h-[40vh] overflow-y-auto p-5 lg:max-h-[92vh]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-brand">
                Evidencia ampliada
              </div>
              <h3 className="mt-2 font-display text-2xl font-black text-ink">
                {photoTitle(photo)}
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
            <InfoCard
              icon={<Camera className="h-4 w-4" />}
              label="Tipo da foto"
              value={photoLabels[photo.type]}
            />
            {supplier ? (
              <InfoCard
                icon={<FileText className="h-4 w-4" />}
                label="Fornecedor"
                value={supplier}
              />
            ) : null}
            {category ? (
              <InfoCard
                icon={<FileText className="h-4 w-4" />}
                label="Categoria"
                value={category}
              />
            ) : null}
            {activity ? (
              <InfoCard
                icon={<FileText className="h-4 w-4" />}
                label="Atividade"
                value={activity}
              />
            ) : null}
            <InfoCard
              icon={<Clock className="h-4 w-4" />}
              label="Data"
              value={formatOnlyDate(evidence.capturedAt)}
            />
            <InfoCard
              icon={<Clock className="h-4 w-4" />}
              label="Hora"
              value={formatOnlyTime(evidence.capturedAt)}
            />
            <InfoCard
              icon={<MapPin className="h-4 w-4" />}
              label={evidence.gpsLabel}
              value={evidence.gpsValue}
            />
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

function OperationalMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <div className="metric-card">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
        {label}
      </div>
      <div className="mt-3 font-display text-3xl font-bold text-ink">
        {value}
      </div>
      <div className="mt-2 text-xs font-bold leading-5 text-slateText">
        {helper}
      </div>
    </div>
  );
}

function MiniVisitInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-3 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
        {label}
      </div>
      <div className="mt-1 text-xs font-bold leading-5 text-ink">{value}</div>
    </div>
  );
}

function InfoCard(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
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

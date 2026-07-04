import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Clock, Eye, FileText, MapPin, RefreshCw, UserRound } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { API_BASE_URL, apiJson } from "../lib/api";
import { auditTypeLabel } from "../lib/labels";

type PromoterSummary = {
  code?: number | null;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

interface VisitPhoto {
  id: string;
  type:
    | "checkin"
    | "before"
    | "after"
    | "supplier_before"
    | "supplier_after"
    | "leaflet"
    | "gondola"
    | "display"
    | "island"
    | "promotional_material"
    | "checkout"
    | "store_extra"
    | "occurrence_extra";
  url: string;
  supplier?: {
    id: string;
    name: string;
    tradeName?: string | null;
  } | null;
  supplierExecution?: {
    id: string;
    supplier?: {
      id: string;
      name: string;
      tradeName?: string | null;
    } | null;
  } | null;
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
  promoter?: PromoterSummary;
  route?: { name?: string | null; scheduledDate?: string | null } | null;
  photos: VisitPhoto[];
  supplierExecutions?: Array<{
    id: string;
    status: string;
    supplier?: { id: string; name: string; tradeName?: string | null } | null;
    deliveryReceived?: boolean | null;
    productsReplenished?: boolean | null;
    stockoutFound?: boolean | null;
    photos: VisitPhoto[];
  }>;
  auditFlags?: Array<{ id: string; type: string; severity: string; resolved: boolean }>;
  createdAt: string;
}

interface RegisteredPromoter extends PromoterSummary {
  id: string;
}

const photoLabels: Record<VisitPhoto["type"], string> = {
  checkin: "Check-in",
  before: "Foto antes",
  after: "Foto depois",
  supplier_before: "Foto antes do fornecedor",
  supplier_after: "Foto depois do fornecedor",
  leaflet: "Panfleto",
  gondola: "Ponta de gondola",
  display: "Display",
  island: "Ilha",
  promotional_material: "Material promocional",
  checkout: "Checkout",
  store_extra: "Foto extra da loja",
  occurrence_extra: "Ocorrência extra"
};

function promoterLabel(promoter?: PromoterSummary | null) {
  if (!promoter) {
    return "-";
  }

  const code = Number(promoter.code);
  const formattedCode = Number.isFinite(code) && code > 0 ? `PRO-${String(code).padStart(4, "0")}` : null;
  const name = promoter.user?.name ?? "Sem nome";

  return formattedCode ? `${formattedCode} - ${name}` : name;
}

function promoterFilterValue(promoter?: PromoterSummary | null) {
  if (!promoter) {
    return "unassigned";
  }

  const code = Number(promoter.code);

  if (Number.isFinite(code) && code > 0) {
    return `code:${code}`;
  }

  const email = promoter.user?.email?.trim().toLowerCase();

  if (email) {
    return `email:${email}`;
  }

  const name = promoter.user?.name?.trim().toLowerCase();

  return name ? `name:${name}` : "unassigned";
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
        : "Não capturado pelo aparelho"
  };
}

function visitGpsText(visit: Visit) {
  const gps = validGpsPair(visit.gpsLatitude, visit.gpsLongitude);
  return gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : "GPS não capturado";
}

function photoUrl(url: string) {
  if (/^(https?:|data:)/i.test(url)) {
    return url;
  }

  return `${API_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

function supplierName(supplier?: { name: string; tradeName?: string | null } | null) {
  if (!supplier) {
    return "Fornecedor nao identificado";
  }

  return supplier.tradeName?.trim() || supplier.name.trim();
}

function isSupplierPhoto(photo: VisitPhoto) {
  return Boolean(
    photo.supplier ||
    photo.supplierExecution?.supplier ||
    photo.type === "supplier_before" ||
    photo.type === "supplier_after"
  );
}

function photoTitle(photo: VisitPhoto) {
  const supplier = photo.supplier ?? photo.supplierExecution?.supplier;

  if (!isSupplierPhoto(photo) || !supplier) {
    return photoLabels[photo.type];
  }

  if (photo.type === "supplier_before") {
    return `${supplierName(supplier)}: foto antes`;
  }

  if (photo.type === "supplier_after") {
    return `${supplierName(supplier)}: foto depois`;
  }

  return `${supplierName(supplier)}: ${photoLabels[photo.type]}`;
}

function hasRequiredPhotos(visit: Visit) {
  const types = new Set(visit.photos.map((photo) => photo.type));

  if ((visit.supplierExecutions?.length ?? 0) === 0) {
    return types.has("checkin") && types.has("before") && types.has("after");
  }

  if (!types.has("checkin")) {
    return false;
  }

  return visit.supplierExecutions!.every((execution) => {
    if (execution.status !== "completed") {
      return true;
    }

    const executionTypes = new Set(execution.photos.map((photo) => photo.type));

    return (
      executionTypes.has("supplier_before") &&
      executionTypes.has("supplier_after") &&
      execution.deliveryReceived !== null &&
      execution.deliveryReceived !== undefined &&
      execution.productsReplenished !== null &&
      execution.productsReplenished !== undefined &&
      execution.stockoutFound !== null &&
      execution.stockoutFound !== undefined
    );
  });
}

export function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [promoters, setPromoters] = useState<RegisteredPromoter[]>([]);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedPromoter, setSelectedPromoter] = useState("");

  const promoterOptions = useMemo(() => {
    const grouped = new Map<string, string>();

    promoters.forEach((promoter) => {
      const value = promoterFilterValue(promoter);
      const label = promoterLabel(promoter);

      if (!grouped.has(value)) {
        grouped.set(value, label);
      }
    });

    if (visits.some((visit) => !visit.promoter)) {
      grouped.set("unassigned", "Sem promotor vinculado");
    }

    return Array.from(grouped.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
  }, [promoters, visits]);

  const filteredVisits = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return visits.filter((visit) => {
      const matchesPromoter = !selectedPromoter || promoterFilterValue(visit.promoter) === selectedPromoter;
      const routeName = visit.route?.name ?? "";
      const clientCode = visit.client.code ?? "";
      const location = `${visit.client.city ?? ""} ${visit.client.state ?? ""}`;

      if (!normalizedSearch) {
        return matchesPromoter;
      }

      const matchesSearch = [
        visit.client.name,
        clientCode,
        routeName,
        visit.status,
        location
      ].join(" ").toLowerCase().includes(normalizedSearch);

      return matchesPromoter && matchesSearch;
    });
  }, [search, selectedPromoter, visits]);

  const selectedVisit = useMemo(
    () => filteredVisits.find((visit) => visit.id === selectedVisitId) ?? filteredVisits[0] ?? null,
    [filteredVisits, selectedVisitId]
  );

  const visitSummary = useMemo(() => {
    const completed = filteredVisits.filter((visit) => visit.status === "completed").length;
    const inProgress = filteredVisits.filter((visit) => visit.status === "in_progress").length;
    const evidences = filteredVisits.reduce((total, visit) => total + visit.photos.length, 0);

    return [
      { title: "Visitas carregadas", value: String(filteredVisits.length), note: "Resultado exibido na tela" },
      { title: "Concluidas", value: String(completed), note: "Atendimentos ja finalizados" },
      { title: "Em atendimento", value: String(inProgress), note: "Jornada ainda aberta" },
      { title: "Evidencias", value: String(evidences), note: "Fotos recebidas do app" }
    ];
  }, [filteredVisits]);

  const visitPhotos = useMemo(
    () => selectedVisit?.photos.filter((photo) => !isSupplierPhoto(photo)) ?? [],
    [selectedVisit]
  );

  const supplierPhotoGroups = useMemo(() => {
    if (!selectedVisit) {
      return [];
    }

    const grouped = new Map<
      string,
      {
        key: string;
        supplierLabel: string;
        photos: VisitPhoto[];
      }
    >();

    selectedVisit.photos
      .filter((photo) => isSupplierPhoto(photo))
      .forEach((photo) => {
        const supplier = photo.supplier ?? photo.supplierExecution?.supplier ?? null;
        const groupKey = photo.supplierExecution?.id ?? supplier?.id ?? photo.id;
        const current = grouped.get(groupKey);

        if (current) {
          current.photos.push(photo);
          return;
        }

        grouped.set(groupKey, {
          key: groupKey,
          supplierLabel: supplierName(supplier),
          photos: [photo]
        });
      });

    return Array.from(grouped.values());
  }, [selectedVisit]);

  async function load() {
    setLoading(true);
    setMessage(null);

    try {
      const [visitsResponse, promotersResponse] = await Promise.all([
        apiJson<{ data: Visit[] }>("/visits"),
        apiJson<{ data: RegisteredPromoter[] }>("/promoters")
      ]);
      setVisits(visitsResponse.data);
      setPromoters(promotersResponse.data);
      setSelectedVisitId((current) => {
        if (current && visitsResponse.data.some((visit) => visit.id === current)) {
          return current;
        }

        return visitsResponse.data[0]?.id ?? null;
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

      <div className="kpi-strip mb-4">
        {visitSummary.map((item) => (
          <article key={item.title} className="kpi-tile">
            <div className="kpi-tile-title">{item.title}</div>
            <div className="kpi-tile-value">{item.value}</div>
            <div className="section-helper mt-2">{item.note}</div>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="table-wrap">
          <div className="glass-strip border-b border-line/80 p-4">
            <div className="flex flex-col gap-3 lg:flex-row">
              <label className="block lg:w-[320px]">
                <span className="field-label">Promotor</span>
                <select
                  className="input-control"
                  value={selectedPromoter}
                  onChange={(event) => setSelectedPromoter(event.target.value)}
                >
                  <option value="">Todos os promotores</option>
                  {promoterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block flex-1">
                <span className="field-label">Buscar cliente, rota, cidade ou situacao</span>
                <input
                  className="input-control"
                  type="search"
                  placeholder="Deixe em branco para listar todas as visitas"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <button
                className="secondary-button h-12 min-w-[148px] self-end"
                type="button"
                onClick={() => {
                  setSearch("");
                  setSelectedPromoter("");
                }}
              >
                Limpar busca
              </button>
            </div>
            <div className="mt-2 text-xs font-semibold text-stone-500">
              {search.trim() || selectedPromoter
                ? `Exibindo ${filteredVisits.length} visita(s) para a busca atual.`
                : `Exibindo ${filteredVisits.length} visita(s). Busca vazia mostra todas as visitas.`}
            </div>
          </div>
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
                {filteredVisits.map((visit) => {
                  const isSelected = visit.id === selectedVisit?.id;

                  return (
                    <tr
                      key={visit.id}
                      data-active={isSelected ? "true" : undefined}
                      className={`${isSelected ? "bg-skywash/80" : "hover:bg-muted/50"} cursor-pointer transition-colors`}
                      tabIndex={0}
                      aria-selected={isSelected}
                      onClick={() => setSelectedVisitId(visit.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedVisitId(visit.id);
                        }
                      }}
                    >
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
                      <button
                        className="icon-button text-moss"
                        type="button"
                        title="Ver detalhes"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedVisitId(visit.id);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                  );
                })}
                {filteredVisits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8">
                      <div className="empty-state">
                        {search.trim() || selectedPromoter
                          ? "Nenhuma visita encontrada para a busca."
                          : "Nenhuma visita encontrada. Sincronize o APK para enviar os atendimentos."}
                      </div>
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
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-2xl bg-white/10 px-3 py-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.12em] text-white/55">Rota</div>
                    <div className="mt-1 text-sm font-bold text-white">{selectedVisit.route?.name ?? "Sem rota vinculada"}</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 px-3 py-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.12em] text-white/55">Evidencias</div>
                    <div className="mt-1 text-sm font-bold text-white">{selectedVisit.photos.length} foto(s) sincronizadas</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <InfoCard icon={<UserRound className="h-4 w-4" />} label="Promotor" value={promoterLabel(selectedVisit.promoter)} />
                <InfoCard icon={<Clock className="h-4 w-4" />} label="Inicio" value={formatDate(selectedVisit.startedAt)} />
                <InfoCard icon={<Clock className="h-4 w-4" />} label="Fim" value={formatDate(selectedVisit.finishedAt)} />
                <InfoCard
                  icon={<MapPin className="h-4 w-4" />}
                  label="GPS da visita"
                  value={visitGpsText(selectedVisit)}
                />
              </div>

              <div className="surface-card">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg font-black text-ink">Evidências</h3>
                    <p className="text-xs font-semibold text-stone-500">Fotos sincronizadas pelo aplicativo</p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-graphite">{visitPhotos.length} foto(s)</span>
                </div>

                <div className="space-y-3">
                  {visitPhotos.map((photo) => {
                    const evidence = photoEvidence(photo, selectedVisit);

                    return (
                      <div key={photo.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                        <img className="h-44 w-full object-cover" src={photoUrl(photo.url)} alt={photoLabels[photo.type]} />
                        <div className="space-y-2 p-3 text-sm">
                          <div className="font-black text-ink">{photoTitle(photo)}</div>
                          <div className="grid gap-2 rounded-xl bg-muted/50 p-3 text-xs font-semibold text-stone-600">
                            <div><span className="font-black text-ink">Data:</span> {formatOnlyDate(evidence.capturedAt)}</div>
                            <div><span className="font-black text-ink">Hora:</span> {formatOnlyTime(evidence.capturedAt)}</div>
                            <div><span className="font-black text-ink">{evidence.gpsLabel}:</span> {evidence.gpsValue}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {visitPhotos.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line bg-muted/40 p-4 text-sm font-semibold text-stone-500">
                      Nenhuma foto chegou para esta visita ainda.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="surface-card">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg font-black text-ink">Fotos por fornecedor</h3>
                    <p className="text-xs font-semibold text-stone-500">Evidencias do antes e depois separadas por fornecedor</p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-graphite">{supplierPhotoGroups.length} fornecedor(es)</span>
                </div>

                <div className="space-y-4">
                  {supplierPhotoGroups.map((group) => (
                    <div key={group.key} className="rounded-2xl border border-line bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-black uppercase tracking-[0.12em] text-stone-500">Fornecedor</div>
                          <div className="mt-1 font-display text-lg font-black text-ink">{group.supplierLabel}</div>
                        </div>
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-graphite">{group.photos.length} foto(s)</span>
                      </div>

                      <div className="grid gap-3">
                        {group.photos.map((photo) => {
                          const evidence = photoEvidence(photo, selectedVisit);

                          return (
                            <div key={photo.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                              <img className="h-40 w-full object-cover" src={photoUrl(photo.url)} alt={photoTitle(photo)} />
                              <div className="space-y-2 p-3 text-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-brand">
                                    {group.supplierLabel}
                                  </span>
                                  <span className="font-black text-ink">{photoTitle(photo)}</span>
                                </div>
                                <div className="grid gap-2 rounded-xl bg-muted/50 p-3 text-xs font-semibold text-stone-600">
                                  <div><span className="font-black text-ink">Data:</span> {formatOnlyDate(evidence.capturedAt)}</div>
                                  <div><span className="font-black text-ink">Hora:</span> {formatOnlyTime(evidence.capturedAt)}</div>
                                  <div><span className="font-black text-ink">{evidence.gpsLabel}:</span> {evidence.gpsValue}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {supplierPhotoGroups.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line bg-muted/40 p-4 text-sm font-semibold text-stone-500">
                      Nenhuma evidencia de fornecedor chegou para esta visita ainda.
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

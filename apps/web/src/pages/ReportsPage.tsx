import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Award,
  AlertTriangle,
  Clock3,
  FileWarning,
  Download,
  Gauge,
  ListChecks,
  MapPinned,
  RefreshCw,
  Route,
  Timer,
  TrendingUp,
  Users
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { useCompanyScope } from "../context/CompanyScopeContext";
import { apiDownload, apiJson, triggerDownload } from "../lib/api";
import { statusLabel } from "../lib/labels";

interface ProductivityReport {
  period: {
    startDate: string;
    endDate: string;
  };
  totals: {
    promoters: number;
    visits: number;
    completedVisits: number;
    photoCount: number;
    visitsWithEvidence: number;
    supplierExecutions: number;
    noDeliveryCount: number;
    stockoutCount: number;
    auditFlags: number;
    serviceMinutesTotal: number;
    travelMinutesTotal: number;
    averageServiceMinutes: number;
    averageTravelMinutes: number;
  };
  promoters: Array<{
    promoterId: string | null;
    promoterCode: number | null;
    promoterName: string;
    visits: number;
    completedVisits: number;
    serviceMinutesTotal: number;
    travelMinutesTotal: number;
    photoCount: number;
    auditFlags: number;
    supplierExecutions: number;
    noDeliveryCount: number;
    stockoutCount: number;
    averageServiceMinutes: number;
    averageTravelMinutes: number;
    firstStartAt: string | null;
    lastFinishAt: string | null;
  }>;
  suppliers: Array<{
    supplierId: string;
    supplierName: string;
    executions: number;
    noDeliveryCount: number;
    stockoutCount: number;
    notesCount: number;
  }>;
  visits: Array<{
    visitId: string;
    promoterCode: number | null;
    promoterName: string;
    clientCode: string | null;
    clientName: string;
    routeName: string | null;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    serviceMinutes: number | null;
    previousClientName: string | null;
    travelFromPreviousMinutes: number | null;
    photoCount: number;
    supplierExecutions: number;
    noDeliveryCount: number;
    stockoutCount: number;
    auditFlags: number;
  }>;
}

const allPromotersKey = "todos";

const reportFiles = [
  { label: "Visitas em arquivo", path: "/reports/visits.csv", fileName: "visitas.csv" },
  { label: "Clientes em planilha", path: "/reports/clients.xls", fileName: "clientes.xls" },
  { label: "Auditoria em PDF", path: "/reports/audit.pdf", fileName: "auditoria.pdf" }
];

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return dateInputValue(date);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatMinutes(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  if (value < 60) {
    return `${value} min`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
}

function promoterCode(value?: number | null) {
  return value ? `PRO-${String(value).padStart(4, "0")}` : "-";
}

function promoterKey(value: { promoterId?: string | null; promoterCode?: number | null; promoterName: string }) {
  return value.promoterId ?? value.promoterCode?.toString() ?? value.promoterName;
}

function percent(value: number, total: number) {
  return Number.isFinite(value) && Number.isFinite(total) && total > 0 ? Math.round((value / total) * 100) : 0;
}

function safeNumber(value?: number | null) {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function ReportsPage() {
  const { scopeKey } = useCompanyScope();
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(dateInputValue(new Date()));
  const [selectedPromoterKey, setSelectedPromoterKey] = useState(allPromotersKey);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [report, setReport] = useState<ProductivityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const productivityPath = useMemo(() => {
    const params = new URLSearchParams();

    if (startDate) {
      params.set("startDate", startDate);
    }

    if (endDate) {
      params.set("endDate", endDate);
    }

    return `/reports/productivity?${params.toString()}`;
  }, [endDate, startDate]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    apiJson<{ data: ProductivityReport }>(productivityPath)
      .then((response) => {
        if (active) {
          setReport(response.data);
        }
      })
      .catch((nextError: Error) => {
        if (active) {
          setError(nextError.message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [productivityPath, refreshSeed, scopeKey]);

  const rankedPromoters = useMemo(
    () =>
      [...(report?.promoters ?? [])].sort((first, second) => {
        if (second.completedVisits !== first.completedVisits) {
          return second.completedVisits - first.completedVisits;
        }

        return first.averageServiceMinutes - second.averageServiceMinutes;
      }),
    [report?.promoters]
  );

  const filteredVisits = useMemo(() => {
    const visits = report?.visits ?? [];

    if (selectedPromoterKey === allPromotersKey) {
      return visits;
    }

    return visits.filter((visit) => promoterKey(visit) === selectedPromoterKey);
  }, [report?.visits, selectedPromoterKey]);

  const selectedPromoter = rankedPromoters.find((promoter) => promoterKey(promoter) === selectedPromoterKey) ?? null;
  const completionRate = report?.totals.visits ? percent(safeNumber(report.totals.completedVisits), safeNumber(report.totals.visits)) : 0;
  const evidenceRate = report?.totals.visits ? percent(safeNumber(report.totals.visitsWithEvidence), safeNumber(report.totals.visits)) : 0;
  const bestPromoter = rankedPromoters[0];
  const selectedCompletedVisits = filteredVisits.filter((visit) => visit.status === "completed").length;
  const attentionVisits = filteredVisits.filter((visit) => safeNumber(visit.noDeliveryCount) > 0 || safeNumber(visit.stockoutCount) > 0 || safeNumber(visit.auditFlags) > 0);
  const timelineVisits = filteredVisits.slice(0, 80);
  const tableVisits = filteredVisits.slice(0, 250);

  async function download(path: string, fileName: string) {
    const blob = await apiDownload(path);
    triggerDownload(blob, fileName);
  }

  async function downloadProductivity() {
    const query = productivityPath.split("?")[1] ?? "";
    const blob = await apiDownload(`/reports/productivity.csv?${query}`);
    triggerDownload(blob, "produtividade-promotores.csv");
  }

  return (
    <section>
      <PageHeader
        title="Produtividade dos promotores"
        subtitle="Acompanhe em tela quem produziu, quanto tempo ficou no cliente e quanto tempo gastou entre um atendimento e outro."
        action={
          <button type="button" className="primary-button" onClick={() => void downloadProductivity()} disabled={!report || loading}>
            <Download className="h-4 w-4" />
            Exportar Excel/CSV
          </button>
        }
      />

      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="mb-5 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="surface-card">
          <p className="brand-chip">Painel em tela</p>
          <h2 className="mt-3 font-display text-xl font-black text-ink">Filtros da operacao</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slateText">
            Use o periodo e o promotor para enxergar a rotina sem precisar abrir planilha.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label>
              <span className="field-label">Data inicial</span>
              <input className="input-control" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              <span className="field-label">Data final</span>
              <input className="input-control" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label className="sm:col-span-2 xl:col-span-1">
              <span className="field-label">Promotor</span>
              <select className="input-control" value={selectedPromoterKey} onChange={(event) => setSelectedPromoterKey(event.target.value)}>
                <option value={allPromotersKey}>Todos os promotores</option>
                {rankedPromoters.map((promoter) => (
                  <option key={promoterKey(promoter)} value={promoterKey(promoter)}>
                    {promoterCode(promoter.promoterCode)} - {promoter.promoterName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button type="button" className="secondary-button mt-4 w-full" onClick={() => setRefreshSeed((current) => current + 1)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar painel
          </button>
        </div>

        <div className="relative overflow-hidden rounded-[1.6rem] bg-navy p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
          <div className="pointer-events-none absolute right-[-7rem] top-[-9rem] h-80 w-80 rounded-full bg-brand/45 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-8rem] left-[28%] h-72 w-72 rounded-full bg-execution/25 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <p className="execution-chip border-white/10 bg-white/10 text-emerald-100">Visao executiva</p>
              <h2 className="mt-4 max-w-3xl font-display text-3xl font-black leading-tight tracking-tight sm:text-5xl">
                Produtividade clara para decidir rapido.
              </h2>
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-white/68">
                Veja o volume de visitas, a taxa de conclusao, o tempo dentro do cliente e o deslocamento da equipe no mesmo painel.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <HeroStat label="Visitas" value={report?.totals.visits ?? 0} />
                <HeroStat label="Concluidas" value={report?.totals.completedVisits ?? 0} />
                <HeroStat label="Evidencias" value={`${evidenceRate}%`} />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/44">Destaque</p>
                  <h3 className="mt-1 font-display text-xl font-black">{bestPromoter?.promoterName ?? "Sem dados"}</h3>
                </div>
                <Award className="h-7 w-7 text-execution" />
              </div>
              <div className="mt-5 space-y-4">
                <HeroProgress label="Execucao" value={completionRate} />
                <HeroProgress label="Evidencias" value={evidenceRate} />
                <div className="grid grid-cols-2 gap-3">
                  <SmallDarkStat label="No cliente" value={formatMinutes(report?.totals.averageServiceMinutes ?? 0)} />
                  <SmallDarkStat label="Deslocamento" value={formatMinutes(report?.totals.averageTravelMinutes ?? 0)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <ProductivityMetric icon={Users} label="Promotores analisados" value={report?.totals.promoters ?? 0} helper="Equipe com visitas no periodo" />
        <ProductivityMetric icon={TrendingUp} label="Taxa de conclusao" value={`${completionRate}%`} helper={`${report?.totals.completedVisits ?? 0} de ${report?.totals.visits ?? 0} visitas`} />
        <ProductivityMetric icon={Timer} label="Media no cliente" value={formatMinutes(report?.totals.averageServiceMinutes ?? 0)} helper="Tempo medio de atendimento" />
        <ProductivityMetric icon={Route} label="Media deslocamento" value={formatMinutes(report?.totals.averageTravelMinutes ?? 0)} helper="Entre fim e inicio de visitas" />
        <ProductivityMetric icon={ListChecks} label="Fornecedores executados" value={report?.totals.supplierExecutions ?? 0} helper="Industrias avaliadas nos clientes" />
        <ProductivityMetric icon={MapPinned} label="Fotos recebidas" value={report?.totals.photoCount ?? 0} helper={`${report?.totals.visitsWithEvidence ?? 0} visita(s) com evidencia`} />
        <ProductivityMetric icon={FileWarning} label="Sem entrega" value={report?.totals.noDeliveryCount ?? 0} helper="Fornecedores sem mercadoria no cliente" />
        <ProductivityMetric icon={AlertTriangle} label="Rupturas" value={report?.totals.stockoutCount ?? 0} helper={`${report?.totals.auditFlags ?? 0} alerta(s) de auditoria`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
        <div className="surface-card">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="brand-chip">Ranking operacional</p>
              <h2 className="mt-3 font-display text-2xl font-black tracking-tight text-ink">Promotores</h2>
              <p className="mt-1 text-sm font-semibold text-slateText">Clique em um promotor para filtrar os atendimentos.</p>
            </div>
            <Gauge className="h-6 w-6 text-brand" />
          </div>

          <div className="space-y-3">
            <button
              type="button"
              className={`w-full rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 ${
                selectedPromoterKey === allPromotersKey ? "border-brand bg-brandSoft shadow-lg shadow-blue-900/10" : "border-line bg-white"
              }`}
              onClick={() => setSelectedPromoterKey(allPromotersKey)}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-black text-ink">Todos os promotores</div>
                  <div className="text-xs font-bold text-slateText">{report?.totals.visits ?? 0} visita(s) no periodo</div>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-brand ring-1 ring-brand/15">Geral</span>
              </div>
            </button>

            {rankedPromoters.map((promoter, index) => (
              <PromoterScoreCard
                key={promoterKey(promoter)}
                promoter={promoter}
                rank={index + 1}
                active={selectedPromoterKey === promoterKey(promoter)}
                onClick={() => setSelectedPromoterKey(promoterKey(promoter))}
              />
            ))}

            {!loading && rankedPromoters.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-line bg-field p-6 text-center text-sm font-bold text-slateText">
                Nenhum promotor com visita no periodo.
              </div>
            ) : null}
          </div>
        </div>

        <div className="surface-card">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="execution-chip">Linha do tempo</p>
              <h2 className="mt-3 font-display text-2xl font-black tracking-tight text-ink">
                {selectedPromoter ? selectedPromoter.promoterName : "Atendimentos do periodo"}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slateText">
                {filteredVisits.length} visita(s), {selectedCompletedVisits} concluida(s).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
              <MiniInfo label="No cliente" value={formatMinutes(selectedPromoter?.averageServiceMinutes ?? report?.totals.averageServiceMinutes ?? 0)} />
              <MiniInfo label="Deslocamento" value={formatMinutes(selectedPromoter?.averageTravelMinutes ?? report?.totals.averageTravelMinutes ?? 0)} />
            </div>
          </div>

          <div className="grid gap-3 2xl:grid-cols-2">
            {timelineVisits.map((visit, index) => (
              <VisitTimelineCard key={visit.visitId} visit={visit} index={index + 1} />
            ))}

            {!loading && filteredVisits.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-line bg-field p-8 text-center text-sm font-bold text-slateText 2xl:col-span-2">
                Nenhum atendimento encontrado para o filtro selecionado.
              </div>
            ) : null}

            {filteredVisits.length > timelineVisits.length ? (
              <div className="rounded-3xl border border-line bg-field p-5 text-center text-sm font-bold text-slateText 2xl:col-span-2">
                Mostrando os primeiros {timelineVisits.length} atendimento(s) em tela. Use a exportacao para baixar todos os {filteredVisits.length} registro(s).
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="surface-card">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="execution-chip">Pontos de atencao</p>
              <h2 className="mt-3 font-display text-2xl font-black tracking-tight text-ink">Visitas com ruptura, sem entrega ou auditoria</h2>
              <p className="mt-1 text-sm font-semibold text-slateText">Lista curta para o supervisor agir sem procurar linha por linha.</p>
            </div>
            <span className="rounded-full bg-amber-50 px-4 py-2 text-xs font-black text-amber-800 ring-1 ring-amber-200">
              {attentionVisits.length} ocorrencia(s)
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {attentionVisits.slice(0, 8).map((visit) => (
              <AttentionVisitCard key={`attention-${visit.visitId}`} visit={visit} />
            ))}

            {!loading && attentionVisits.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-line bg-field p-8 text-center text-sm font-bold text-slateText lg:col-span-2">
                Nenhuma visita com ruptura, sem entrega ou auditoria no filtro atual.
              </div>
            ) : null}
          </div>
        </div>

        <div className="surface-card">
          <div className="mb-5">
            <p className="brand-chip">Fornecedores</p>
            <h2 className="mt-3 font-display text-2xl font-black tracking-tight text-ink">Resumo por industria</h2>
            <p className="mt-1 text-sm font-semibold text-slateText">Quem mais apareceu com ruptura ou sem entrega.</p>
          </div>

          <div className="space-y-3">
            {(report?.suppliers ?? []).slice(0, 8).map((supplier, index) => (
              <SupplierSummaryCard key={supplier.supplierId} supplier={supplier} rank={index + 1} />
            ))}

            {!loading && (report?.suppliers ?? []).length === 0 ? (
              <div className="rounded-3xl border border-dashed border-line bg-field p-6 text-center text-sm font-bold text-slateText">
                Nenhum fornecedor executado no periodo.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="table-wrap mt-5">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Detalhe tecnico para conferencia</h2>
            <p className="panel-subtitle">Base completa do painel, mantendo a leitura operacional em tela.</p>
          </div>
          <button type="button" className="secondary-button h-10" onClick={() => void downloadProductivity()} disabled={!report || loading}>
            <Download className="h-4 w-4" />
            Exportar
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[980px]">
            <thead>
              <tr>
                <th>Promotor</th>
                <th>Cliente</th>
                <th>Situacao</th>
                <th>Inicio</th>
                <th>Fim</th>
                <th>No cliente</th>
                <th>Deslocamento</th>
                <th>Fotos</th>
                <th>Sem entrega</th>
                <th>Ruptura</th>
              </tr>
            </thead>
            <tbody>
              {tableVisits.map((visit) => (
                <tr key={visit.visitId}>
                  <td>
                    <div className="font-black">{visit.promoterName}</div>
                    <div className="text-xs font-bold text-slateText">{promoterCode(visit.promoterCode)}</div>
                  </td>
                  <td>
                    <div className="font-black">{visit.clientName}</div>
                    <div className="text-xs font-bold text-slateText">{visit.routeName ?? "Sem rota vinculada"}</div>
                  </td>
                  <td><StatusPill value={visit.status} /></td>
                  <td>{formatDateTime(visit.startedAt)}</td>
                  <td>{formatDateTime(visit.finishedAt)}</td>
                  <td>{formatMinutes(visit.serviceMinutes)}</td>
                  <td>{formatMinutes(visit.travelFromPreviousMinutes)}</td>
                  <td>{visit.photoCount}</td>
                  <td>{visit.noDeliveryCount}</td>
                  <td>{visit.stockoutCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredVisits.length > tableVisits.length ? (
          <div className="border-t border-line bg-field px-5 py-3 text-xs font-bold text-slateText">
            Grade limitada aos primeiros {tableVisits.length} registro(s) para manter a tela rapida. A exportacao CSV contem todos os {filteredVisits.length} registro(s).
          </div>
        ) : null}
      </div>

      <div className="table-wrap mt-5">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Arquivos complementares</h2>
            <p className="panel-subtitle">Exportacoes tradicionais para conferencia e auditoria.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Relatorio</th>
                <th>Arquivo</th>
                <th className="w-28">Acao</th>
              </tr>
            </thead>
            <tbody>
              {reportFiles.map((item) => (
                <tr key={item.path}>
                  <td className="font-medium">{item.label}</td>
                  <td>{item.fileName}</td>
                  <td>
                    <button type="button" title={`Baixar ${item.fileName}`} onClick={() => void download(item.path, item.fileName)} className="icon-button text-moss">
                      <Download className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loading ? <div className="mt-4 text-sm font-bold text-slateText">Carregando produtividade...</div> : null}
      <div className="mt-3 text-xs font-bold text-slateText">
        Regra: {statusLabel("completed")} conta como visita concluida. Tempo no cliente usa inicio e fim do atendimento. Deslocamento usa o fim da visita anterior e o inicio da proxima visita do mesmo promotor.
      </div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/48">{label}</div>
      <div className="mt-2 font-display text-3xl font-black text-white">{value}</div>
    </div>
  );
}

function HeroProgress({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-[0.14em] text-white/54">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div className="h-2 rounded-full bg-gradient-to-r from-execution to-sky-300" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function SmallDarkStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/44">{label}</div>
      <div className="mt-1 font-display text-lg font-black text-white">{value}</div>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-field px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slateText">{label}</div>
      <div className="mt-1 font-display text-lg font-black text-ink">{value}</div>
    </div>
  );
}

function ProductivityMetric({
  icon: Icon,
  label,
  value,
  helper
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="metric-card">
      <div className="relative z-[1] flex items-start justify-between gap-3">
        <div>
          <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slateText">{label}</span>
          <div className="mt-3 font-display text-3xl font-black tracking-tight text-ink">{value}</div>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brandSoft text-brand">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="relative z-[1] mt-3 text-xs font-bold text-slateText">{helper}</p>
    </div>
  );
}

function PromoterScoreCard({
  promoter,
  rank,
  active,
  onClick
}: {
  promoter: ProductivityReport["promoters"][number];
  rank: number;
  active: boolean;
  onClick: () => void;
}) {
  const executionRate = percent(safeNumber(promoter.completedVisits), safeNumber(promoter.visits));

  return (
    <button
      type="button"
      className={`w-full rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 ${
        active ? "border-brand bg-brandSoft shadow-lg shadow-blue-900/10" : "border-line bg-white hover:bg-skywash"
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-navy font-display text-lg font-black text-white">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-black text-ink">{promoter.promoterName}</div>
              <div className="text-xs font-bold text-slateText">{promoterCode(promoter.promoterCode)}</div>
            </div>
            <span className="rounded-full bg-executionSoft px-3 py-1 text-xs font-black text-emerald-700">{executionRate}%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-gradient-to-r from-brand to-execution" style={{ width: `${executionRate}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <PromoterMiniStat label="Visitas" value={safeNumber(promoter.visits)} />
            <PromoterMiniStat label="Cliente" value={formatMinutes(safeNumber(promoter.averageServiceMinutes))} />
            <PromoterMiniStat label="Rota" value={formatMinutes(safeNumber(promoter.averageTravelMinutes))} />
          </div>
        </div>
      </div>
    </button>
  );
}

function PromoterMiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-field px-2 py-2">
      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slateText">{label}</div>
      <div className="mt-1 text-xs font-black text-ink">{value}</div>
    </div>
  );
}

function VisitTimelineCard({ visit, index }: { visit: ProductivityReport["visits"][number]; index: number }) {
  return (
    <article className="rounded-3xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-navy font-display text-lg font-black text-white">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-black leading-tight text-ink">{visit.clientName}</h3>
              <p className="mt-1 text-xs font-bold text-slateText">{visit.routeName ?? "Sem rota vinculada"}</p>
            </div>
            <StatusPill value={visit.status} />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <TimelineInfo icon={Clock3} label="Horario" value={`${formatTime(visit.startedAt)} - ${formatTime(visit.finishedAt)}`} />
            <TimelineInfo icon={Timer} label="No cliente" value={formatMinutes(visit.serviceMinutes)} />
            <TimelineInfo icon={MapPinned} label="Deslocamento" value={formatMinutes(visit.travelFromPreviousMinutes)} />
          </div>

          <div className="mt-3 rounded-2xl bg-field px-3 py-2 text-xs font-bold text-slateText">
            {visit.previousClientName ? `Veio de: ${visit.previousClientName}` : "Primeira visita registrada para este promotor no periodo."}
          </div>
        </div>
      </div>
    </article>
  );
}

function AttentionVisitCard({ visit }: { visit: ProductivityReport["visits"][number] }) {
  return (
    <article className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-black leading-tight text-ink">{visit.clientName}</h3>
          <p className="mt-1 text-xs font-bold text-slateText">{visit.promoterName} - {visit.routeName ?? "Sem rota"}</p>
        </div>
        <StatusPill value={visit.status} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <PromoterMiniStat label="Sem entrega" value={safeNumber(visit.noDeliveryCount)} />
        <PromoterMiniStat label="Ruptura" value={safeNumber(visit.stockoutCount)} />
        <PromoterMiniStat label="Auditoria" value={safeNumber(visit.auditFlags)} />
      </div>
      <div className="mt-3 rounded-2xl bg-white/70 px-3 py-2 text-xs font-bold text-amber-900">
        {formatDateTime(visit.startedAt)} | {safeNumber(visit.photoCount)} foto(s) sincronizada(s)
      </div>
    </article>
  );
}

function SupplierSummaryCard({
  supplier,
  rank
}: {
  supplier: ProductivityReport["suppliers"][number];
  rank: number;
}) {
  const attentionTotal = supplier.noDeliveryCount + supplier.stockoutCount;

  return (
    <div className="rounded-3xl border border-line bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-navy font-display text-base font-black text-white">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="font-black leading-tight text-ink">{supplier.supplierName}</div>
            <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${
              attentionTotal > 0
                ? "bg-amber-50 text-amber-800 ring-amber-200"
                : "bg-emerald-50 text-emerald-800 ring-emerald-200"
            }`}>
              {attentionTotal} alerta(s)
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <PromoterMiniStat label="Execucoes" value={safeNumber(supplier.executions)} />
            <PromoterMiniStat label="Sem entrega" value={safeNumber(supplier.noDeliveryCount)} />
            <PromoterMiniStat label="Ruptura" value={safeNumber(supplier.stockoutCount)} />
          </div>
          <div className="mt-3 text-xs font-bold text-slateText">{safeNumber(supplier.notesCount)} justificativa(s) registrada(s)</div>
        </div>
      </div>
    </div>
  );
}

function TimelineInfo({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-field p-3">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 font-display text-base font-black text-ink">{value}</div>
    </div>
  );
}

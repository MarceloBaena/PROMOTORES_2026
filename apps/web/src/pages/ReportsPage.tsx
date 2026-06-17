import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Route, Timer, TrendingUp, Users } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
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
    averageServiceMinutes: number;
    averageTravelMinutes: number;
    firstStartAt: string | null;
    lastFinishAt: string | null;
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
  }>;
}

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

function formatMinutes(value?: number | null) {
  if (value === null || value === undefined) {
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

export function ReportsPage() {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(dateInputValue(new Date()));
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
  }, [productivityPath]);

  async function download(path: string, fileName: string) {
    const blob = await apiDownload(path);
    triggerDownload(blob, fileName);
  }

  async function downloadProductivity() {
    const query = productivityPath.split("?")[1] ?? "";
    const blob = await apiDownload(`/reports/productivity.csv?${query}`);
    triggerDownload(blob, "produtividade-promotores.csv");
  }

  const completionRate = report?.totals.visits ? Math.round((report.totals.completedVisits / report.totals.visits) * 100) : 0;

  return (
    <section>
      <PageHeader
        title="Relatórios operacionais"
        subtitle="Analise produtividade dos promotores, tempo dentro do cliente e deslocamento entre atendimentos."
        action={
          <button type="button" className="primary-button" onClick={() => void downloadProductivity()} disabled={!report || loading}>
            <Download className="h-4 w-4" />
            Exportar produtividade
          </button>
        }
      />

      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="mb-5 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="surface-card">
          <div className="mb-4">
            <p className="brand-chip">Filtro do relatório</p>
            <h2 className="mt-3 font-display text-xl font-black text-ink">Período analisado</h2>
            <p className="mt-1 text-sm font-semibold text-slateText">
              O deslocamento é calculado entre o fim de uma visita e o início da próxima do mesmo promotor.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label>
              <span className="field-label">Data inicial</span>
              <input className="input-control" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              <span className="field-label">Data final</span>
              <input className="input-control" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <button type="button" className="secondary-button mt-4 w-full" onClick={() => void apiJson<{ data: ProductivityReport }>(productivityPath).then((response) => setReport(response.data))}>
            <RefreshCw className="h-4 w-4" />
            Atualizar relatório
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <ProductivityMetric icon={Users} label="Promotores analisados" value={report?.totals.promoters ?? 0} helper="Com visitas no período" />
          <ProductivityMetric icon={TrendingUp} label="Conclusão" value={`${completionRate}%`} helper={`${report?.totals.completedVisits ?? 0} de ${report?.totals.visits ?? 0} visitas`} />
          <ProductivityMetric icon={Timer} label="Média no cliente" value={formatMinutes(report?.totals.averageServiceMinutes ?? 0)} helper="Tempo de atendimento" />
          <ProductivityMetric icon={Route} label="Média deslocamento" value={formatMinutes(report?.totals.averageTravelMinutes ?? 0)} helper="Entre clientes" />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="table-wrap">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Resumo por promotor</h2>
              <p className="panel-subtitle">Tempo total e média operacional no período selecionado.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Promotor</th>
                  <th>Visitas</th>
                  <th>Concluídas</th>
                  <th>Média cliente</th>
                  <th>Média deslocamento</th>
                </tr>
              </thead>
              <tbody>
                {(report?.promoters ?? []).map((promoter) => (
                  <tr key={promoter.promoterId ?? promoter.promoterName}>
                    <td>
                      <div className="font-black">{promoter.promoterName}</div>
                      <div className="text-xs font-bold text-slateText">{promoterCode(promoter.promoterCode)}</div>
                    </td>
                    <td>{promoter.visits}</td>
                    <td>{promoter.completedVisits}</td>
                    <td>{formatMinutes(promoter.averageServiceMinutes)}</td>
                    <td>{formatMinutes(promoter.averageTravelMinutes)}</td>
                  </tr>
                ))}
                {!loading && (report?.promoters.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slateText">
                      Nenhuma visita encontrada no período.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="table-wrap">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Detalhe de produtividade</h2>
              <p className="panel-subtitle">Sequência real de atendimentos, deslocamento e tempo no cliente.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Promotor</th>
                  <th>Cliente</th>
                  <th>Situação</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>No cliente</th>
                  <th>Deslocamento</th>
                </tr>
              </thead>
              <tbody>
                {(report?.visits ?? []).map((visit) => (
                  <tr key={visit.visitId}>
                    <td>
                      <div className="font-black">{visit.promoterName}</div>
                      <div className="text-xs font-bold text-slateText">{promoterCode(visit.promoterCode)}</div>
                    </td>
                    <td>
                      <div className="font-black">{visit.clientName}</div>
                      <div className="text-xs font-bold text-slateText">{visit.routeName ?? "Sem rota vinculada"}</div>
                    </td>
                    <td>
                      <StatusPill value={visit.status} />
                    </td>
                    <td>{formatDateTime(visit.startedAt)}</td>
                    <td>{formatDateTime(visit.finishedAt)}</td>
                    <td>{formatMinutes(visit.serviceMinutes)}</td>
                    <td>
                      <div className="font-black">{formatMinutes(visit.travelFromPreviousMinutes)}</div>
                      <div className="text-xs font-bold text-slateText">
                        {visit.previousClientName ? `Desde ${visit.previousClientName}` : "Primeira visita do promotor"}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && (report?.visits.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slateText">
                      Nenhum atendimento encontrado para calcular produtividade.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="table-wrap mt-5">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Arquivos complementares</h2>
            <p className="panel-subtitle">Exportações tradicionais para conferência e auditoria.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Relatório</th>
                <th>Arquivo</th>
                <th className="w-28">Ação</th>
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
        Regra: {statusLabel("completed")} conta como visita concluída. Tempo no cliente usa início e fim do atendimento. Deslocamento usa o fim da visita anterior e o início da próxima visita do mesmo promotor.
      </div>
    </section>
  );
}

function ProductivityMetric({
  icon: Icon,
  label,
  value,
  helper
}: {
  icon: typeof Users;
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

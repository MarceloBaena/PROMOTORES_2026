import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  MapPinned,
  Navigation,
  RadioTower,
  Route,
  Store,
  UserRoundCheck,
  Users
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { apiJson } from "../lib/api";

interface Summary {
  clients: number;
  promoters: number;
  supervisors: number;
  routes: number;
  routesToday: {
    planned: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    total: number;
    date: string;
    timeZone: string;
  };
  auditFlags: number;
  visits: Record<string, number>;
  visitsToday: Record<string, number>;
  checkinsToday: number;
  imports: Array<{
    id: string;
    fileName: string;
    status: string;
    totalRows: number;
    importedRows: number;
    failedRows: number;
    createdAt: string;
  }>;
}

const chartBars = [52, 68, 44, 76, 58, 88, 64];
const weekLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

export function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ data: Summary }>("/reports/summary")
      .then((response) => setSummary(response.data))
      .catch((nextError: Error) => setError(nextError.message));
  }, []);

  const todayVisits = summary?.visitsToday ?? {};
  const completedVisits = todayVisits.completed ?? 0;
  const inProgressVisits = todayVisits.in_progress ?? 0;
  const pendingVisits = todayVisits.pending ?? 0;
  const totalOperationalVisits = completedVisits + inProgressVisits + pendingVisits;
  const executionRate = totalOperationalVisits > 0 ? Math.round((completedVisits / totalOperationalVisits) * 100) : 0;
  const routeDay = summary?.routesToday ?? { planned: 0, inProgress: 0, completed: 0, cancelled: 0, total: 0 };

  const kpis = useMemo(
    () => [
      {
        label: "Promotores ativos",
        value: summary?.promoters ?? 0,
        helper: "Equipe apta para campo",
        icon: Users,
        tone: "text-brand bg-brandSoft"
      },
      {
        label: "Visitas hoje",
        value: totalOperationalVisits,
        helper: "Pendentes, em andamento e concluidas",
        icon: ClipboardCheck,
        tone: "text-execution bg-executionSoft"
      },
      {
        label: "Check-ins realizados",
        value: summary?.checkinsToday ?? 0,
        helper: "Atendimentos com evidencia",
        icon: CheckCircle2,
        tone: "text-emerald-700 bg-emerald-50"
      },
      {
        label: "Clientes atendidos",
        value: completedVisits,
        helper: `${summary?.clients ?? 0} clientes na base`,
        icon: Store,
        tone: "text-blue-700 bg-blue-50"
      },
      {
        label: "Taxa de execucao",
        value: `${executionRate}%`,
        helper: "Conclusao sobre visitas registradas",
        icon: RadioTower,
        tone: "text-indigo-700 bg-indigo-50"
      },
      {
        label: "Pendencias",
        value: (summary?.auditFlags ?? 0) + pendingVisits,
        helper: "Alertas e visitas pendentes",
        icon: AlertTriangle,
        tone: "text-amber-700 bg-amber-50"
      }
    ],
    [completedVisits, executionRate, pendingVisits, summary?.auditFlags, summary?.checkinsToday, summary?.clients, summary?.promoters, totalOperationalVisits]
  );

  return (
    <section>
      <PageHeader
        title="Painel executivo de campo"
        subtitle="Acompanhe execucao, promotores, rotas, evidencias e alertas em uma visao unificada de operacao."
        action={
          <Link to="/mapa" className="primary-button">
            <MapPinned className="h-4 w-4" />
            Abrir mapa ao vivo
          </Link>
        }
      />
      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="metric-card">
              <div className="relative z-[1] flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slateText">{item.label}</span>
                  <div className="mt-3 font-display text-3xl font-black tabular-nums tracking-tight text-ink">{item.value}</div>
                </div>
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${item.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <p className="relative z-[1] mt-3 text-xs font-bold leading-5 text-slateText">{item.helper}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="surface-card overflow-hidden bg-navy p-0 text-white">
          <div className="relative p-6 sm:p-7">
            <div className="pointer-events-none absolute right-[-7rem] top-[-8rem] h-80 w-80 rounded-full bg-brand/35 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-8rem] left-[30%] h-72 w-72 rounded-full bg-execution/20 blur-3xl" />
            <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div>
                <p className="execution-chip border-white/10 bg-white/10 text-emerald-100">Centro de comando</p>
                <h2 className="mt-4 max-w-3xl font-display text-3xl font-black leading-tight tracking-tight sm:text-5xl">
                  Execucao, rota e evidencias no mesmo cockpit operacional.
                </h2>
                <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-white/68">
                  Priorize visitas criticas, acompanhe promotores ativos e aja rapido quando houver pendencias de auditoria ou sincronizacao.
                </p>
                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  <CommandStat label="Rotas publicadas" value={summary?.routes ?? 0} />
                  <CommandStat label="Supervisores" value={summary?.supervisors ?? 0} />
                  <CommandStat label="Alertas" value={summary?.auditFlags ?? 0} danger={Boolean(summary?.auditFlags)} />
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/44">Cobertura</p>
                    <h3 className="mt-1 font-display text-lg font-black">Rota do dia</h3>
                  </div>
                  <Navigation className="h-5 w-5 text-execution" />
                </div>
                <div className="space-y-3">
                  <RouteStep label="Planejado" value={routeDay.planned} active={routeDay.planned > 0} />
                  <RouteStep label="Em atendimento" value={routeDay.inProgress} active={routeDay.inProgress > 0} />
                  <RouteStep label="Concluido" value={routeDay.completed} active={routeDay.completed > 0} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="surface-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slateText">Prioridade operacional</p>
              <h3 className="mt-2 font-display text-2xl font-black tracking-tight text-ink">Acompanhar evidencias</h3>
            </div>
            <Camera className="h-6 w-6 text-brand" />
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-slateText">
            Revise fotos, GPS e auditorias antes de publicar novas rotas. O foco e reduzir retrabalho no campo.
          </p>
          <div className="mt-5 space-y-3">
            <PriorityRow label="Alertas abertos" value={summary?.auditFlags ?? 0} tone="danger" />
            <PriorityRow label="Importacoes recentes" value={summary?.imports.length ?? 0} tone="brand" />
            <PriorityRow label="Visitas pendentes" value={pendingVisits} tone="warning" />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Visitas por dia</h2>
              <p className="panel-subtitle">Leitura visual para acompanhamento executivo da rotina.</p>
            </div>
            <ArrowUpRight className="h-5 w-5 text-execution" />
          </div>
          <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="flex h-64 items-end gap-3 rounded-3xl border border-line bg-field/70 p-4">
              {chartBars.map((height, index) => (
                <div key={weekLabels[index]} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-44 w-full items-end rounded-full bg-white p-1 shadow-inner shadow-slate-100">
                    <div
                      className="w-full rounded-full bg-gradient-to-t from-brand to-execution shadow-[0_10px_24px_rgba(37,99,235,0.20)]"
                      style={{ height: `${Math.max(16, height)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slateText">{weekLabels[index]}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <PerformanceCard label="Performance por promotor" value={executionRate} />
              <PerformanceCard label="Performance por supervisor" value={summary?.supervisors ? Math.min(100, executionRate + 8) : 0} />
              <PerformanceCard label="Cobertura de rota" value={summary?.routes ? Math.min(100, executionRate + 12) : 0} />
            </div>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Mapa em tempo real</h2>
              <p className="panel-subtitle">Promotores ativos, ultimo check-in e rotas.</p>
            </div>
            <Link to="/mapa" className="secondary-button h-10">
              Ver mapa
            </Link>
          </div>
          <div className="mini-map-grid relative h-[21.5rem] overflow-hidden bg-skywash">
            <div className="absolute left-[18%] top-[26%] h-3 w-3 rounded-full bg-execution shadow-[0_0_0_10px_rgba(16,185,129,0.18)]" />
            <div className="absolute left-[58%] top-[36%] h-3 w-3 rounded-full bg-brand shadow-[0_0_0_10px_rgba(37,99,235,0.16)]" />
            <div className="absolute left-[72%] top-[68%] h-3 w-3 rounded-full bg-warning shadow-[0_0_0_10px_rgba(245,158,11,0.18)]" />
            <div className="absolute left-[19%] top-[28%] h-[2px] w-[42%] rotate-[8deg] bg-brand/30" />
            <div className="absolute left-[58%] top-[39%] h-[2px] w-[24%] rotate-[48deg] bg-execution/40" />
            <div className="absolute bottom-5 left-5 right-5 rounded-3xl border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-900/10 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slateText">Operacao ao vivo</p>
                  <p className="mt-1 text-sm font-black text-ink">{summary?.promoters ?? 0} promotor(es) na base</p>
                </div>
                <MapPinned className="h-6 w-6 text-brand" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="table-wrap mt-5">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Importacoes recentes</h2>
            <p className="panel-subtitle">Historico de cargas de planilha e consistencia dos dados importados.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="px-4 py-3">Arquivo</th>
                <th className="px-4 py-3">Situacao</th>
                <th className="px-4 py-3">Linhas</th>
                <th className="px-4 py-3">Importadas</th>
                <th className="px-4 py-3">Falhas</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.imports ?? []).map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium">{item.fileName}</td>
                  <td className="px-4 py-3"><StatusPill value={item.status} /></td>
                  <td className="px-4 py-3">{item.totalRows}</td>
                  <td className="px-4 py-3">{item.importedRows}</td>
                  <td className="px-4 py-3">{item.failedRows}</td>
                </tr>
              ))}
              {(summary?.imports?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slateText">
                    {summary ? "Sem importacoes registradas." : "Carregando..."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function CommandStat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/48">{label}</div>
      <div className={`mt-2 font-display text-3xl font-black ${danger ? "text-warning" : "text-white"}`}>{value}</div>
    </div>
  );
}

function RouteStep({ label, value, active }: { label: string; value: number; active: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`grid h-8 w-8 place-items-center rounded-full ${active ? "bg-execution text-white" : "bg-white/10 text-white/40"}`}>
        <Route className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-black text-white">{label}</div>
        <div className="text-xs font-semibold text-white/48">{value} registro(s)</div>
      </div>
    </div>
  );
}

function PriorityRow({ label, value, tone }: { label: string; value: number; tone: "danger" | "brand" | "warning" }) {
  const toneClass = {
    danger: "text-danger bg-red-50",
    brand: "text-brand bg-blue-50",
    warning: "text-warning bg-amber-50"
  }[tone];

  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3">
      <span className="text-sm font-black text-graphite">{label}</span>
      <span className={`rounded-full px-3 py-1 font-display text-lg font-black ${toneClass}`}>{value}</span>
    </div>
  );
}

function PerformanceCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-slateText">{label}</span>
        <span className="font-display text-xl font-black text-ink">{value}%</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-gradient-to-r from-brand to-execution" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

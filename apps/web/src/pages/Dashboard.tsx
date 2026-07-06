import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  MapPinned,
  Navigation,
  RadioTower,
  Route,
  Store,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { PromotersLiveMap } from "../components/PromotersLiveMap";
import { PageHeader } from "../components/PageHeader";
import { apiJson } from "../lib/api";
import { useLivePromoters } from "../lib/live-map";

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
  fieldWork: {
    activePromoters: number;
    releasedClientsToday: number;
    attendedClientsToday: number;
    inServiceNow: number;
    openUnder48: number;
    noServiceOver48: number;
    executionRate: number;
    staleRuleHours: number;
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

const emptyRouteDay = { planned: 0, inProgress: 0, completed: 0, cancelled: 0, total: 0 };
const emptyFieldWork = {
  activePromoters: 0,
  releasedClientsToday: 0,
  attendedClientsToday: 0,
  inServiceNow: 0,
  openUnder48: 0,
  noServiceOver48: 0,
  executionRate: 0,
  staleRuleHours: 48
};

export function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { items: liveMapItems, message: liveMapMessage, connectedCount, inRouteCount, reload: reloadLiveMap } = useLivePromoters();

  useEffect(() => {
    apiJson<{ data: Summary }>("/reports/summary")
      .then((response) => setSummary(response.data))
      .catch((nextError: Error) => setError(nextError.message));
  }, []);

  const routeDay = summary?.routesToday ?? emptyRouteDay;
  const fieldWork = summary?.fieldWork ?? emptyFieldWork;
  const realAttentionCount = fieldWork.noServiceOver48 + (summary?.auditFlags ?? 0);

  const kpis = useMemo(
    () => [
      {
        label: "Promotores",
        value: fieldWork.activePromoters,
        helper: "Ativos e aptos para atendimento",
        icon: Users,
        tone: "text-brand bg-brandSoft"
      },
      {
        label: "Clientes liberados",
        value: fieldWork.releasedClientsToday,
        helper: "Clientes publicados em roteiro hoje",
        icon: ClipboardCheck,
        tone: "text-execution bg-executionSoft"
      },
      {
        label: "Clientes atendidos",
        value: fieldWork.attendedClientsToday,
        helper: "Concluidos pelo app no roteiro",
        icon: CheckCircle2,
        tone: "text-emerald-700 bg-emerald-50"
      },
      {
        label: "Em atendimento",
        value: fieldWork.inServiceNow,
        helper: "Visitas abertas neste momento",
        icon: Clock3,
        tone: "text-blue-700 bg-blue-50"
      },
      {
        label: "Sem atendimento",
        value: fieldWork.noServiceOver48,
        helper: `Apenas apos ${fieldWork.staleRuleHours}h sem conclusao`,
        icon: AlertTriangle,
        tone: fieldWork.noServiceOver48 > 0 ? "text-danger bg-red-50" : "text-slateText bg-slate-100"
      },
      {
        label: "Execucao",
        value: `${fieldWork.executionRate}%`,
        helper: "Atendidos sobre liberados",
        icon: RadioTower,
        tone: "text-indigo-700 bg-indigo-50"
      }
    ],
    [fieldWork]
  );

  return (
    <section>
      <PageHeader
        title="Painel executivo de campo"
        subtitle="Resumo simples da operacao: promotores, clientes liberados, atendimentos e excecoes reais."
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
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slateText sm:text-[11px]">{item.label}</span>
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

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="surface-card overflow-hidden bg-navy p-0 text-white">
          <div className="relative p-5 sm:p-6">
            <div className="pointer-events-none absolute right-[-7rem] top-[-8rem] h-80 w-80 rounded-full bg-brand/35 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-8rem] left-[30%] h-72 w-72 rounded-full bg-execution/20 blur-3xl" />
            <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="execution-chip border-white/10 bg-white/10 text-emerald-100">Controle do dia</p>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white/55">
                    Regra 48h ativa
                  </span>
                </div>
                <h2 className="mt-4 font-display text-2xl font-black leading-tight tracking-tight sm:text-3xl">
                  Resumo da operacao em campo
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/68">
                  Veja rapidamente quem esta trabalhando, quantos clientes foram liberados e o que realmente exige acao.
                </p>

                <div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))]">
                  <CommandStat label="Base ativa" value={summary?.clients ?? 0} />
                  <CommandStat label="Promotores" value={fieldWork.activePromoters} />
                  <CommandStat label="Liberados" value={fieldWork.releasedClientsToday} />
                  <CommandStat label="Atendidos" value={fieldWork.attendedClientsToday} />
                </div>

                <div className="mt-4 rounded-3xl border border-white/10 bg-white/10 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-white/55">Execucao do dia</span>
                    <span className="font-display text-xl font-black text-white">{fieldWork.executionRate}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-brand to-execution"
                      style={{ width: `${Math.min(100, Math.max(0, fieldWork.executionRate))}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs font-semibold leading-5 text-white/55">
                    Clientes pendentes so entram em atencao quando passam de {fieldWork.staleRuleHours} horas sem conclusao.
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/44">Roteiro</p>
                    <h3 className="mt-1 font-display text-lg font-black">Hoje</h3>
                  </div>
                  <Navigation className="h-5 w-5 text-execution" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <RouteStep label="Rotas do dia" value={routeDay.total} active={routeDay.total > 0} />
                  <RouteStep label="Clientes liberados" value={fieldWork.releasedClientsToday} active={fieldWork.releasedClientsToday > 0} />
                  <RouteStep label="Clientes atendidos" value={fieldWork.attendedClientsToday} active={fieldWork.attendedClientsToday > 0} />
                  <RouteStep label="Dentro do prazo" value={fieldWork.openUnder48} active={fieldWork.openUnder48 > 0} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="surface-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slateText">Excecoes</p>
              <h3 className="mt-2 font-display text-xl font-black tracking-tight text-ink sm:text-2xl">O que precisa de acao</h3>
            </div>
            <AlertTriangle className={`h-6 w-6 ${realAttentionCount > 0 ? "text-danger" : "text-execution"}`} />
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-slateText">
            O painel nao trata cliente pendente como erro antes do prazo operacional. A regra atual considera sem atendimento somente apos 48 horas.
          </p>
          <div className="mt-5 space-y-3">
            <PriorityRow label="Sem atendimento 48h+" value={fieldWork.noServiceOver48} tone={fieldWork.noServiceOver48 > 0 ? "danger" : "neutral"} />
            <PriorityRow label="Auditorias abertas" value={summary?.auditFlags ?? 0} tone={(summary?.auditFlags ?? 0) > 0 ? "warning" : "neutral"} />
            <PriorityRow label="Em atendimento agora" value={fieldWork.inServiceNow} tone="brand" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Resumo operacional</h2>
              <p className="panel-subtitle">Dados reais do roteiro publicado e dos atendimentos recebidos pelo aplicativo.</p>
            </div>
          </div>
          <div className="grid gap-3 p-5 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
            <OperationalTile icon={Store} label="Base ativa" value={summary?.clients ?? 0} description="Clientes cadastrados e ativos" />
            <OperationalTile icon={Route} label="Rotas cadastradas" value={summary?.routes ?? 0} description="Historico de roteirizacoes" />
            <OperationalTile icon={CheckCircle2} label="Check-ins hoje" value={summary?.checkinsToday ?? 0} description="Evidencias iniciadas no app" />
            <OperationalTile icon={AlertTriangle} label="Canceladas hoje" value={routeDay.cancelled} description="Rotas canceladas no dia" danger={routeDay.cancelled > 0} />
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Mapa em tempo real</h2>
              <p className="panel-subtitle">Acompanhe promotores durante a jornada ativa com mapa real de rua.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="secondary-button h-10" onClick={() => void reloadLiveMap()}>
                Atualizar
              </button>
              <Link to="/mapa" className="secondary-button h-10">
                Ver mapa
              </Link>
            </div>
          </div>
          <div className="space-y-3 p-4">
            {liveMapMessage ? <div className="notice notice-warning !mb-0">{liveMapMessage}</div> : null}
            <PromotersLiveMap items={liveMapItems} compact heightClassName="h-[18rem]" />
            <div className="rounded-3xl border border-line bg-white/90 p-4 shadow-sm shadow-slate-900/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slateText">Equipe em campo</p>
                  <p className="mt-1 text-sm font-black text-ink">{connectedCount} promotor(es) com sinal recente</p>
                  <p className="mt-1 text-xs font-semibold text-slateText">{inRouteCount} em jornada de rota ou atendimento</p>
                </div>
                <MapPinned className="h-6 w-6 text-brand" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CommandStat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/10 p-3">
      <div className="break-words text-[10px] font-black uppercase leading-4 tracking-[0.1em] text-white/48">{label}</div>
      <div className={`mt-1 font-display text-xl font-black leading-none sm:text-2xl ${danger ? "text-warning" : "text-white"}`}>{value}</div>
    </div>
  );
}

function RouteStep({ label, value, active }: { label: string; value: number; active: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-white/5 p-3">
      <span className={`grid h-8 w-8 place-items-center rounded-full ${active ? "bg-execution text-white" : "bg-white/10 text-white/40"}`}>
        <Route className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-black text-white">{label}</div>
        <div className="text-xs font-semibold text-white/48">{value} registro(s)</div>
      </div>
    </div>
  );
}

function PriorityRow({ label, value, tone }: { label: string; value: number; tone: "danger" | "brand" | "warning" | "neutral" }) {
  const toneClass = {
    danger: "text-danger bg-red-50",
    brand: "text-brand bg-blue-50",
    warning: "text-warning bg-amber-50",
    neutral: "text-slateText bg-slate-100"
  }[tone];

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3">
      <span className="min-w-0 break-words text-sm font-black text-graphite">{label}</span>
      <span className={`rounded-full px-3 py-1 font-display text-lg font-black ${toneClass}`}>{value}</span>
    </div>
  );
}

function OperationalTile({
  icon: Icon,
  label,
  value,
  description,
  danger = false
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  description: string;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-3xl border border-line bg-white p-4 shadow-sm shadow-slate-900/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-[10px] font-black uppercase leading-4 tracking-[0.1em] text-slateText sm:text-[11px]">{label}</p>
          <p className="mt-2 font-display text-2xl font-black text-ink">{value}</p>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-2xl ${danger ? "bg-red-50 text-danger" : "bg-brandSoft text-brand"}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs font-bold leading-5 text-slateText">{description}</p>
    </div>
  );
}

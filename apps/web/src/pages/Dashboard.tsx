import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardCheck, MapPinned, Store, UserRoundCheck, Users } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { apiJson } from "../lib/api";

interface Summary {
  clients: number;
  promoters: number;
  supervisors: number;
  routes: number;
  auditFlags: number;
  visits: Record<string, number>;
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

const metricIcons = [Store, Users, UserRoundCheck, MapPinned, ClipboardCheck, AlertTriangle];
const metricAccents = [
  "from-moss/16 to-emerald-50 text-moss",
  "from-steel/16 to-skywash text-steel",
  "from-forest/14 to-emerald-50 text-forest",
  "from-copper/16 to-orange-50 text-copper",
  "from-moss/16 to-emerald-50 text-moss",
  "from-berry/14 to-rose-50 text-berry"
];

export function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ data: Summary }>("/reports/summary")
      .then((response) => setSummary(response.data))
      .catch((nextError: Error) => setError(nextError.message));
  }, []);

  const metrics = [
    ["Clientes ativos", summary?.clients ?? 0],
    ["Promotores", summary?.promoters ?? 0],
    ["Supervisores", summary?.supervisors ?? 0],
    ["Rotas", summary?.routes ?? 0],
    ["Visitas concluidas", summary?.visits.completed ?? 0],
    ["Flags abertas", summary?.auditFlags ?? 0]
  ] as const;

  return (
    <section>
      <PageHeader
        title="Dashboard operacional"
        subtitle="Visao executiva do campo: equipe, rotas, visitas, importacoes e alertas de auditoria."
      />
      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="surface-card overflow-hidden bg-gradient-to-br from-forest to-ink p-0 text-white">
          <div className="relative p-6 sm:p-7">
            <div className="pointer-events-none absolute right-[-6rem] top-[-8rem] h-72 w-72 rounded-full bg-white/12 blur-2xl" />
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-100/70">Centro de comando</p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Operacao pronta para acompanhar a equipe em campo.
            </h2>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-white/68">
              Use este painel para validar cadastros, publicar roteiros, revisar visitas e agir rapidamente sobre auditorias abertas.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Visitas</div>
                <div className="mt-2 font-display text-2xl font-bold">{summary?.visits.completed ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Rotas</div>
                <div className="mt-2 font-display text-2xl font-bold">{summary?.routes ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Auditoria</div>
                <div className="mt-2 font-display text-2xl font-bold">{summary?.auditFlags ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="surface-card">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-500">Prioridade do dia</p>
          <h3 className="mt-2 font-display text-xl font-bold tracking-tight text-ink">Acompanhar evidencias</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-stone-500">
            Verifique flags abertas, visitas concluidas e importacoes com falha antes de publicar novos roteiros.
          </p>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-field px-4 py-3">
              <span className="text-sm font-bold text-graphite">Flags abertas</span>
              <span className="font-display text-xl font-bold text-berry">{summary?.auditFlags ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-field px-4 py-3">
              <span className="text-sm font-bold text-graphite">Importacoes recentes</span>
              <span className="font-display text-xl font-bold text-steel">{summary?.imports.length ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {metrics.map(([label, value], index) => {
          const Icon = metricIcons[index];
          return (
            <div key={label} className="metric-card">
              <div className="flex items-start justify-between gap-3">
                <span className="relative z-[1] text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">{label}</span>
                <span className={`relative z-[1] grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${metricAccents[index]}`}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="relative z-[1] mt-4 font-display text-3xl font-bold tabular-nums tracking-tight">{value}</div>
            </div>
          );
        })}
      </div>

      <div className="table-wrap mt-6">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Importacoes recentes</h2>
            <p className="panel-subtitle">Historico de cargas CSV e consistencia dos dados importados.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="px-4 py-3">Arquivo</th>
                <th className="px-4 py-3">Status</th>
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
                  <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
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

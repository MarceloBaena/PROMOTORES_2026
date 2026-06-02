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
      <PageHeader title="Dashboard operacional" />
      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {metrics.map(([label, value], index) => {
          const Icon = metricIcons[index];
          return (
            <div key={label} className="metric-card">
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-bold uppercase text-stone-500">{label}</span>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line bg-field text-steel">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold tabular-nums">{value}</div>
            </div>
          );
        })}
      </div>

      <div className="table-wrap mt-5">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Importacoes recentes</h2>
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

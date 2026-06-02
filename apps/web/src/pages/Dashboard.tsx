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
      {error ? <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value], index) => {
          const Icon = metricIcons[index];
          return (
            <div key={label} className="rounded-lg border border-line bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-stone-500">{label}</span>
                <Icon className="h-5 w-5 text-moss" />
              </div>
              <div className="mt-4 text-3xl font-bold">{value}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-lg border border-line bg-white shadow-sm">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-base font-bold">Importacoes recentes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-field text-xs uppercase text-stone-500">
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
                <tr key={item.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{item.fileName}</td>
                  <td className="px-4 py-3"><StatusPill value={item.status} /></td>
                  <td className="px-4 py-3">{item.totalRows}</td>
                  <td className="px-4 py-3">{item.importedRows}</td>
                  <td className="px-4 py-3">{item.failedRows}</td>
                </tr>
              ))}
              {summary?.imports?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-stone-500">Sem importacoes registradas.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

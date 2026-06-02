import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { apiJson } from "../lib/api";

interface AuditFlag {
  id: string;
  type: string;
  severity: string;
  resolved: boolean;
  createdAt: string;
  visit: {
    client: { name: string };
    promoter?: { user?: { name?: string } };
  };
}

export function AuditPage() {
  const [flags, setFlags] = useState<AuditFlag[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ data: AuditFlag[] }>("/audit")
      .then((response) => setFlags(response.data))
      .catch((error: Error) => setMessage(error.message));
  }, []);

  return (
    <section>
      <PageHeader title="Auditoria" />
      {message ? <div className="notice notice-warning">{message}</div> : null}
      <div className="table-wrap">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Promotor</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Severidade</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((flag) => (
                <tr key={flag.id}>
                  <td className="px-4 py-3 font-medium">{flag.visit.client.name}</td>
                  <td className="px-4 py-3">{flag.visit.promoter?.user?.name ?? "-"}</td>
                  <td className="px-4 py-3">{flag.type}</td>
                  <td className="px-4 py-3"><StatusPill value={flag.severity} /></td>
                  <td className="px-4 py-3">{flag.resolved ? "Resolvida" : "Aberta"}</td>
                </tr>
              ))}
              {flags.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-stone-500">Nenhuma flag encontrada.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

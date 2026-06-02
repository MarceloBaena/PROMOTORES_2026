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
      {message ? <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{message}</div> : null}
      <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-field text-xs uppercase text-stone-500">
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
                <tr key={flag.id} className="border-t border-line">
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

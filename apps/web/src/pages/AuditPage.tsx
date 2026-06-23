import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, CheckCircle2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { apiJson } from "../lib/api";
import { auditTypeLabel } from "../lib/labels";

interface AuditFlag {
  id: string;
  type: string;
  severity: string;
  resolved: boolean;
  createdAt: string;
  visit: {
    client: { name: string };
    promoter?: { code?: number; user?: { name?: string } };
  };
}

function promoterLabel(promoter?: AuditFlag["visit"]["promoter"]) {
  if (!promoter) {
    return "-";
  }

  const code = Number(promoter.code);
  const formattedCode = Number.isFinite(code) && code > 0 ? `PRO-${String(code).padStart(4, "0")}` : null;
  const name = promoter.user?.name ?? "Sem nome";

  return formattedCode ? `${formattedCode} - ${name}` : name;
}

export function AuditPage() {
  const [flags, setFlags] = useState<AuditFlag[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const loadFlags = useCallback(() => {
    apiJson<{ data: AuditFlag[] }>("/audit")
      .then((response) => setFlags(response.data))
      .catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  async function resolveFlag(flagId: string) {
    setLoadingAction(`resolve-${flagId}`);
    setMessage(null);

    try {
      await apiJson(`/audit/${flagId}/resolve`, { method: "PATCH" });
      setFlags((current) => current.filter((flag) => flag.id !== flagId));
      setMessage("Alerta removido da auditoria.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel remover o alerta.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function requeueFlag(flagId: string) {
    setLoadingAction(`requeue-${flagId}`);
    setMessage(null);

    try {
      await apiJson(`/audit/${flagId}/requeue`, { method: "POST" });
      setFlags((current) => current.filter((flag) => flag.id !== flagId));
      setMessage("Cliente colocado em novo roteiro publicado para o promotor.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel colocar o cliente em roteiro.");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <section>
      <PageHeader
        title="Auditoria"
        subtitle="Analise cada alerta aberto e decida se ele deve ser removido da auditoria ou reenviado para atendimento."
      />
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
                <th className="px-4 py-3">Situacao</th>
                <th className="px-4 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((flag) => (
                <tr key={flag.id}>
                  <td className="px-4 py-3 font-medium">{flag.visit.client.name}</td>
                  <td className="px-4 py-3">{promoterLabel(flag.visit.promoter)}</td>
                  <td className="px-4 py-3">{auditTypeLabel(flag.type)}</td>
                  <td className="px-4 py-3"><StatusPill value={flag.severity} /></td>
                  <td className="px-4 py-3">{flag.resolved ? "Resolvida" : "Aberta"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="secondary-button h-10"
                        type="button"
                        disabled={Boolean(loadingAction)}
                        onClick={() => void resolveFlag(flag.id)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {loadingAction === `resolve-${flag.id}` ? "Removendo..." : "Remover"}
                      </button>
                      <button
                        className="primary-button h-10"
                        type="button"
                        disabled={Boolean(loadingAction)}
                        onClick={() => void requeueFlag(flag.id)}
                      >
                        <CalendarPlus className="h-4 w-4" />
                        {loadingAction === `requeue-${flag.id}` ? "Criando..." : "Colocar em roteiro"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {flags.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-stone-500">Nenhum alerta aberto encontrado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

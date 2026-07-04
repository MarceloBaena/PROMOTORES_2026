import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, CheckCircle2, RefreshCw } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await apiJson<{ data: AuditFlag[] }>("/audit");
      setFlags(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel carregar a auditoria.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredFlags = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return flags;
    }

    return flags.filter((flag) =>
      [
        flag.visit.client.name,
        promoterLabel(flag.visit.promoter),
        auditTypeLabel(flag.type),
        flag.severity,
        flag.resolved ? "resolvida" : "aberta"
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [flags, search]);

  const auditSummary = useMemo(() => {
    const openCount = filteredFlags.filter((flag) => !flag.resolved).length;
    const resolvedCount = filteredFlags.filter((flag) => flag.resolved).length;
    const highSeverity = filteredFlags.filter((flag) => flag.severity.toLowerCase() === "high").length;

    return [
      { title: "Alertas exibidos", value: String(filteredFlags.length), note: "Resultado atual da busca" },
      { title: "Em aberto", value: String(openCount), note: "Pendencias para tratar" },
      { title: "Resolvidos", value: String(resolvedCount), note: "Itens ja tratados" },
      { title: "Alta severidade", value: String(highSeverity), note: "Prioridade de acao" }
    ];
  }, [filteredFlags]);

  async function resolveFlag(flagId: string) {
    setLoadingAction(`resolve-${flagId}`);
    setMessage(null);

    try {
      await apiJson(`/audit/${flagId}/resolve`, { method: "PATCH", body: JSON.stringify({}) });
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
        subtitle="Acompanhe flags operacionais, resolva alertas e recoloque clientes em roteiro quando necessario."
        action={
          <button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        }
      />
      {message ? <div className="notice notice-warning">{message}</div> : null}
      <div className="kpi-strip mb-4">
        {auditSummary.map((item) => (
          <article key={item.title} className="kpi-tile">
            <div className="kpi-tile-title">{item.title}</div>
            <div className="kpi-tile-value">{item.value}</div>
            <div className="section-helper mt-2">{item.note}</div>
          </article>
        ))}
      </div>
      <div className="table-wrap">
        <div className="glass-strip border-b border-line/80 p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="block flex-1">
              <span className="field-label">Buscar cliente, promotor, tipo, severidade ou situacao</span>
              <input
                className="input-control"
                type="search"
                placeholder="Deixe em branco para listar toda a auditoria"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button className="secondary-button h-12 min-w-[148px] self-end" type="button" onClick={() => setSearch("")}>
              Limpar busca
            </button>
          </div>
          <div className="mt-2 text-xs font-semibold text-stone-500">
            {search.trim()
              ? `Exibindo ${filteredFlags.length} alerta(s) para a busca atual.`
              : `Exibindo ${filteredFlags.length} alerta(s). Busca vazia mostra toda a auditoria.`}
          </div>
        </div>
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
              {filteredFlags.map((flag) => (
                <tr key={flag.id}>
                  <td className="px-4 py-3 font-medium">{flag.visit.client.name}</td>
                  <td className="px-4 py-3">{promoterLabel(flag.visit.promoter)}</td>
                  <td className="px-4 py-3">{auditTypeLabel(flag.type)}</td>
                  <td className="px-4 py-3">
                    <StatusPill value={flag.severity} />
                  </td>
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
              {filteredFlags.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8">
                    <div className="empty-state">
                      {search.trim() ? "Nenhum alerta encontrado para a busca." : "Nenhum alerta encontrado."}
                    </div>
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

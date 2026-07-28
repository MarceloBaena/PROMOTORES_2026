import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
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
    client: { name: string; tradeName?: string | null };
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

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR");
}

function ClientName({ client, inverse = false }: { client: AuditFlag["visit"]["client"]; inverse?: boolean }) {
  const tradeName = client.tradeName?.trim();
  return (
    <>
      <div className={inverse ? "mt-2 font-display text-2xl font-black" : "text-sm font-black text-ink"}>{client.name}</div>
      {tradeName && tradeName !== client.name ? (
        <div className={inverse ? "mt-1 text-sm font-black text-blue-100" : "mt-1 text-xs font-semibold text-slateText"}>
          Fantasia: {tradeName}
        </div>
      ) : null}
    </>
  );
}

export function AuditPage() {
  const [flags, setFlags] = useState<AuditFlag[]>([]);
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filteredFlags = useMemo(() => {
    if (severityFilter === "all") {
      return flags;
    }

    return flags.filter(
      (flag) => String(flag.severity).toLowerCase() === severityFilter,
    );
  }, [flags, severityFilter]);

  const selectedFlag = useMemo(
    () =>
      filteredFlags.find((flag) => flag.id === selectedFlagId) ??
      filteredFlags[0] ??
      null,
    [filteredFlags, selectedFlagId]
  );

  const criticalCount = flags.filter((flag) => String(flag.severity).toLowerCase() === "high").length;
  const mediumCount = flags.filter((flag) => String(flag.severity).toLowerCase() === "medium").length;
  const impactedPromoters = new Set(flags.map((flag) => promoterLabel(flag.visit.promoter))).size;

  const loadFlags = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiJson<{ data: AuditFlag[] }>("/audit");
      setFlags(response.data);
      setSelectedFlagId((current) => {
        if (current && response.data.some((flag) => flag.id === current)) {
          return current;
        }

        return response.data[0]?.id ?? null;
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel carregar a auditoria.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  useEffect(() => {
    if (
      selectedFlagId &&
      filteredFlags.some((flag) => flag.id === selectedFlagId)
    ) {
      return;
    }

    setSelectedFlagId(filteredFlags[0]?.id ?? null);
  }, [filteredFlags, selectedFlagId]);

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
        subtitle="Fila de analise operacional para decidir o que sai da auditoria e o que volta para novo atendimento."
        action={(
          <button className="secondary-button" type="button" disabled={loading} onClick={() => void loadFlags()}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        )}
      />

      {message ? <div className="notice notice-warning">{message}</div> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AuditMetric label="Alertas abertos" value={flags.length} helper="Itens aguardando decisao manual." icon={ShieldAlert} tone="warning" />
        <AuditMetric label="Severidade alta" value={criticalCount} helper="Ocorrencias que merecem prioridade imediata." icon={AlertTriangle} tone="danger" />
        <AuditMetric label="Severidade media" value={mediumCount} helper="Alertas validos para conferencia do supervisor." icon={AlertTriangle} tone="neutral" />
        <AuditMetric label="Promotores impactados" value={impactedPromoters} helper="Equipe com ocorrencias em aberto nesta fila." icon={CheckCircle2} tone="brand" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="table-wrap">
          <div className="border-b border-line bg-white p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slateText">
                  Severidade
                </span>
                <select
                  className="field-select"
                  value={severityFilter}
                  onChange={(event) => setSeverityFilter(event.target.value)}
                >
                  <option value="all">Todas as severidades</option>
                  <option value="high">Alta</option>
                  <option value="medium">Media</option>
                  <option value="low">Baixa</option>
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <AuditFilterStat
                  label="Em tela"
                  value={`${filteredFlags.length}`}
                  helper="Alertas visiveis no filtro atual."
                />
                <AuditFilterStat
                  label="Alta"
                  value={`${criticalCount}`}
                  helper="Exigem prioridade operacional."
                />
                <AuditFilterStat
                  label="Promotores"
                  value={`${impactedPromoters}`}
                  helper="Equipe impactada na fila."
                />
              </div>
            </div>
          </div>

          <div className="panel-header">
            <div>
              <h2 className="panel-title">Fila da auditoria</h2>
              <p className="panel-subtitle">Selecione um alerta para decidir se ele deve ser encerrado ou voltar para a roteirizacao.</p>
            </div>
            <span className="rounded-full bg-field px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
              {filteredFlags.length} item(ns)
            </span>
          </div>

          <div className="space-y-3 p-4">
            {filteredFlags.map((flag) => {
              const isSelected = selectedFlag?.id === flag.id;
              const tradeName = flag.visit.client.tradeName?.trim();
              const primaryName =
                tradeName && tradeName !== flag.visit.client.name
                  ? tradeName
                  : flag.visit.client.name;
              const secondaryName =
                tradeName && tradeName !== flag.visit.client.name
                  ? flag.visit.client.name
                  : null;

              return (
                <button
                  key={flag.id}
                  type="button"
                  className={`w-full rounded-[1.35rem] border p-4 text-left transition ${
                    isSelected
                      ? "border-brand bg-blue-50/70 shadow-sm shadow-brand/10"
                      : "border-line bg-white hover:border-brand/30 hover:bg-field"
                  }`}
                  onClick={() => setSelectedFlagId(flag.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-black text-ink">{primaryName}</div>
                      {secondaryName ? (
                        <div className="mt-1 text-xs font-semibold text-slateText">
                          Razao social: {secondaryName}
                        </div>
                      ) : null}
                      <div className="mt-1 text-xs font-semibold text-slateText">{promoterLabel(flag.visit.promoter)}</div>
                      <div className="mt-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-brand">
                        {auditTypeLabel(flag.type)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusPill value={flag.severity} />
                      <span className="text-[11px] font-bold text-slateText">{formatDate(flag.createdAt)}</span>
                    </div>
                  </div>
                </button>
              );
            })}

            {filteredFlags.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-white px-4 py-8 text-center text-sm font-semibold text-stone-500">
                Nenhum alerta encontrado para o filtro selecionado.
              </div>
            ) : null}
          </div>
        </div>

        <aside className="panel overflow-hidden xl:sticky xl:top-20 xl:self-start">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Decisao da auditoria</h2>
              <p className="panel-subtitle">Analise o impacto e escolha a acao para o cliente.</p>
            </div>
          </div>

          {!selectedFlag ? (
            <div className="p-5 text-sm font-semibold text-stone-500">Selecione um alerta para continuar.</div>
          ) : (
            <div className="space-y-4 p-5">
              <div className="rounded-[1.35rem] bg-navy p-4 text-white">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-white/55">Cliente</div>
                <ClientName client={selectedFlag.visit.client} inverse />
                <div className="mt-2 text-sm font-semibold text-white/75">{promoterLabel(selectedFlag.visit.promoter)}</div>
                <div className="mt-3"><StatusPill value={selectedFlag.severity} /></div>
              </div>

              <div className="rounded-[1.35rem] border border-line bg-field p-3">
                <div className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-slateText">
                  Leitura rapida
                </div>
                <div className="grid gap-3">
                  <AuditInfoRow label="Tipo de alerta" value={auditTypeLabel(selectedFlag.type)} />
                  <AuditInfoRow label="Criado em" value={formatDate(selectedFlag.createdAt)} />
                  <AuditInfoRow label="Situacao" value={selectedFlag.resolved ? "Resolvida" : "Aberta"} />
                </div>
              </div>

              <div className="surface-card">
                <h3 className="font-display text-lg font-black text-ink">Acoes disponiveis</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slateText">
                  Remova o alerta se a ocorrencia ja foi tratada ou publique novamente o cliente em roteiro para que o promotor volte ao ponto.
                </p>

                <div className="mt-4 space-y-3">
                  <button
                    className="secondary-button h-11 w-full"
                    type="button"
                    disabled={Boolean(loadingAction)}
                    onClick={() => void resolveFlag(selectedFlag.id)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {loadingAction === `resolve-${selectedFlag.id}` ? "Removendo..." : "Remover da auditoria"}
                  </button>

                  <button
                    className="primary-button h-11 w-full"
                    type="button"
                    disabled={Boolean(loadingAction)}
                    onClick={() => void requeueFlag(selectedFlag.id)}
                  >
                    <CalendarPlus className="h-4 w-4" />
                    {loadingAction === `requeue-${selectedFlag.id}` ? "Criando..." : "Colocar em novo roteiro"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function AuditMetric({
  label,
  value,
  helper,
  icon: Icon,
  tone
}: {
  label: string;
  value: number;
  helper: string;
  icon: typeof ShieldAlert;
  tone: "warning" | "danger" | "neutral" | "brand";
}) {
  const toneClass = {
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-danger",
    neutral: "bg-slate-100 text-slateText",
    brand: "bg-blue-50 text-brand"
  }[tone];

  return (
    <div className="metric-card">
      <div className="relative z-[1] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">{label}</div>
          <div className="mt-3 font-display text-3xl font-bold text-ink">{value}</div>
        </div>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="relative z-[1] mt-2 text-xs font-bold leading-5 text-slateText">{helper}</div>
    </div>
  );
}

function AuditFilterStat({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-field px-3 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">{label}</div>
      <div className="mt-1 text-lg font-black text-ink">{value}</div>
      <div className="mt-1 text-[11px] font-semibold leading-5 text-slateText">{helper}</div>
    </div>
  );
}

function AuditInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">{label}</div>
      <div className="mt-1 text-sm font-black text-ink">{value}</div>
    </div>
  );
}

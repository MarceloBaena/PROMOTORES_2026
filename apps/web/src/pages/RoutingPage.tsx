import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, Send, X, Users, Store, Route as RouteIcon } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { useAuth } from "../context/AuthContext";
import { useCompanyScope } from "../context/CompanyScopeContext";
import { apiJson } from "../lib/api";
import { statusLabel } from "../lib/labels";
import { activeCompaniesOnly, companyLabel, type CompanyOption } from "../lib/company-options";

interface RoutePlan {
  id: string;
  name: string;
  status: string;
  operationalStatus?: string;
  progress?: {
    totalItems: number;
    completedItems: number;
    resolvedWithoutCompletionItems: number;
    unresolvedItems: number;
    inProgressItems: number;
    plannedItems: number;
    isExpired: boolean;
  };
  scheduledDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  promoter?: { code?: number; user?: { name?: string } };
  supervisor?: { code?: number; user?: { name?: string } };
  items: Array<{ id: string; sequence: number; client: { name: string } }>;
}

interface PersonOption {
  id: string;
  code?: number;
  companyId?: string | null;
  supervisor?: {
    id?: string;
  } | null;
  user?: {
    name?: string;
    email?: string;
  };
}

interface ClientOption {
  id: string;
  companyId?: string | null;
  code?: string | null;
  name?: string;
  city?: string | null;
  state?: string | null;
  defaultPromoter?: {
    id?: string;
  } | null;
}

function personLabel(profile?: { code?: number; user?: { name?: string } }, prefix: "PRO" | "SUP" = "PRO") {
  if (!profile) {
    return "-";
  }

  const code = Number(profile.code);
  const formattedCode = Number.isFinite(code) && code > 0 ? `${prefix}-${String(code).padStart(4, "0")}` : null;
  const name = profile.user?.name ?? "Sem nome";

  return formattedCode ? `${formattedCode} - ${name}` : name;
}

function optionLabel(option: PersonOption, prefix: "PRO" | "SUP") {
  return personLabel(option, prefix);
}

function clientLabel(client: ClientOption) {
  const code = client.code ? `${client.code} - ` : "";
  const city = client.city ? ` (${client.city}${client.state ? `/${client.state}` : ""})` : "";
  return `${code}${client.name ?? "Cliente sem nome"}${city}`;
}

function formatRoutePeriod(route: RoutePlan) {
  const startValue = route.startDate ?? route.scheduledDate;
  const endValue = route.endDate;

  if (!startValue && !endValue) {
    return "-";
  }

  const startLabel = startValue ? new Date(startValue).toLocaleString("pt-BR") : "-";
  const endLabel = endValue ? new Date(endValue).toLocaleString("pt-BR") : "-";

  return `${startLabel} ate ${endLabel}`;
}

function routeOperationalStatus(route: RoutePlan) {
  return route.operationalStatus ?? route.status;
}

function routeProgressText(route: RoutePlan) {
  const progress = route.progress;

  if (!progress) {
    return `${route.items.length} cliente(s) na rota`;
  }

  const parts = [
    progress.completedItems > 0 ? `${progress.completedItems} concluido(s)` : null,
    progress.inProgressItems > 0 ? `${progress.inProgressItems} em atendimento` : null,
    progress.plannedItems > 0 ? `${progress.plannedItems} planejado(s)` : null,
    progress.resolvedWithoutCompletionItems > 0 ? `${progress.resolvedWithoutCompletionItems} nao concluido(s)` : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" - ") : "Sem clientes vinculados";
}

export function RoutingPage() {
  const { user } = useAuth();
  const { scopeKey, selectedCompanyId } = useCompanyScope();
  const [routes, setRoutes] = useState<RoutePlan[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [supervisors, setSupervisors] = useState<PersonOption[]>([]);
  const [promoters, setPromoters] = useState<PersonOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [form, setForm] = useState({
    name: "",
    startDate: "",
    endDate: "",
    companyId: user?.companyId ?? selectedCompanyId ?? "",
    supervisorId: "",
    promoterId: ""
  });
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [filters, setFilters] = useState({ supervisor: "", promoter: "", client: "" });
  const [routeSearch, setRouteSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const isPlatformAdmin = user?.role === "ADMIN" && !user.companyId;

  async function load() {
    const [routesResponse, companiesResponse, supervisorsResponse, promotersResponse, clientsResponse] = await Promise.all([
      apiJson<{ data: RoutePlan[] }>("/routes"),
      apiJson<{ data: CompanyOption[] }>("/companies"),
      apiJson<{ data: PersonOption[] }>("/supervisors"),
      apiJson<{ data: PersonOption[] }>("/promoters"),
      apiJson<{ data: ClientOption[] }>("/clients")
    ]);

    setRoutes(routesResponse.data);
    setCompanies(activeCompaniesOnly(companiesResponse.data));
    setSupervisors(supervisorsResponse.data);
    setPromoters(promotersResponse.data);
    setClients(clientsResponse.data);
  }

  useEffect(() => {
    load().catch((error: Error) => setMessage(error.message));
  }, [scopeKey]);

  useEffect(() => {
    const nextCompanyId = user?.companyId ?? selectedCompanyId ?? "";

    setForm((current) => {
      if (current.companyId === nextCompanyId) {
        return current;
      }

      return {
        ...current,
        companyId: nextCompanyId,
        supervisorId: "",
        promoterId: ""
      };
    });
    setSelectedClientIds([]);
    setFilters((current) => ({ ...current, supervisor: "", promoter: "", client: "" }));
  }, [selectedCompanyId, user?.companyId]);

  async function createRoute(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (!form.name.trim()) {
      setMessage("Informe o nome da rota.");
      return;
    }

    if (!form.startDate) {
      setMessage("Informe a data inicial da rota.");
      return;
    }

    if (!form.endDate) {
      setMessage("Informe a data final da rota.");
      return;
    }

    if (new Date(form.endDate) < new Date(form.startDate)) {
      setMessage("A data final da rota precisa ser maior ou igual a data inicial.");
      return;
    }

    if (isPlatformAdmin && !form.companyId) {
      setMessage("Selecione a empresa/filial da rota.");
      return;
    }

    if (!form.supervisorId) {
      setMessage("Selecione um supervisor.");
      return;
    }

    if (!form.promoterId) {
      setMessage("Selecione um promotor.");
      return;
    }

    if (selectedClientIds.length === 0) {
      setMessage("Selecione pelo menos um cliente para o roteiro.");
      return;
    }

    try {
      await apiJson("/routes", {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(Object.entries(form).filter(([, value]) => value !== "")),
          startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
          endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
          clientIds: selectedClientIds
        })
      });
      setForm({
        name: "",
        startDate: "",
        endDate: "",
        companyId: user?.companyId ?? selectedCompanyId ?? "",
        supervisorId: "",
        promoterId: ""
      });
      setSelectedClientIds([]);
      setFilters({ supervisor: "", promoter: "", client: "" });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rota nao criada.");
    }
  }

  async function publish(id: string) {
    await apiJson(`/routes/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "PUBLISHED" })
    });
    await load();
  }

  const filteredSupervisors = supervisors.filter((supervisor) =>
    (!form.companyId || supervisor.companyId === form.companyId) &&
    optionLabel(supervisor, "SUP").toLowerCase().includes(filters.supervisor.toLowerCase())
  );

  const filteredPromoters = promoters.filter((promoter) =>
    (!form.companyId || promoter.companyId === form.companyId) &&
    (!form.supervisorId || promoter.supervisor?.id === form.supervisorId) &&
    optionLabel(promoter, "PRO").toLowerCase().includes(filters.promoter.toLowerCase())
  );

  const filteredClients = clients.filter((client) =>
    (!form.companyId || client.companyId === form.companyId) &&
    clientLabel(client).toLowerCase().includes(filters.client.toLowerCase())
  );

  const filteredRoutes = routes.filter((route) => {
    const normalizedSearch = routeSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return true;
    }

    const routeClients = route.items.map((item) => item.client.name).join(" ");
    const supervisorName = route.supervisor?.user?.name ?? "";
    const promoterName = route.promoter?.user?.name ?? "";

    return [
      route.name,
      routeOperationalStatus(route),
      statusLabel(routeOperationalStatus(route)),
      promoterName,
      supervisorName,
      routeClients
    ].join(" ").toLowerCase().includes(normalizedSearch);
  });

  const routeOverview = useMemo(() => {
    const statuses = filteredRoutes.map((route) => routeOperationalStatus(route));

    return [
      { label: "Rascunho", value: statuses.filter((status) => status === "DRAFT").length },
      { label: "Publicada", value: statuses.filter((status) => status === "PUBLISHED").length },
      { label: "Em atendimento", value: statuses.filter((status) => status === "IN_PROGRESS").length },
      { label: "Concluida", value: statuses.filter((status) => status === "COMPLETED").length },
      { label: "Nao concluida", value: statuses.filter((status) => status === "NOT_COMPLETED").length }
    ];
  }, [filteredRoutes]);

  const selectedClients = selectedClientIds
    .map((id) => clients.find((client) => client.id === id))
    .filter((client): client is ClientOption => Boolean(client));

  function toggleClient(clientId: string) {
    setSelectedClientIds((current) =>
      current.includes(clientId) ? current.filter((id) => id !== clientId) : [...current, clientId]
    );
  }

  return (
    <section>
      <PageHeader
        title="Roteirizacao"
        subtitle="Monte a rota com periodo, equipe e clientes e acompanhe o andamento das publicacoes."
      />

      {message ? <div className="notice notice-warning">{message}</div> : null}

      <div className="kpi-strip mb-4">
        {routeOverview.map((item) => (
          <article key={item.label} className="kpi-tile">
            <div className="kpi-tile-title">{item.label}</div>
            <div className="kpi-tile-value">{item.value}</div>
            <div className="section-helper mt-2">rotas no filtro atual</div>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[460px_minmax(0,1fr)]">
        <form onSubmit={createRoute} className="panel overflow-hidden xl:sticky xl:top-20 xl:self-start">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Nova rota</h2>
              <p className="panel-subtitle">Defina periodo, equipe e clientes da jornada operacional.</p>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-2xl border border-line bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slateText">
                <RouteIcon className="h-4 w-4" />
                Dados da rota
              </div>
              <div className="grid gap-3">
                <label className="block">
                  <span className="field-label">Empresa/Filial</span>
                  <select
                    className="input-control"
                    disabled={!isPlatformAdmin}
                    value={form.companyId}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, companyId: event.target.value, supervisorId: "", promoterId: "" }));
                      setSelectedClientIds([]);
                      setFilters({ supervisor: "", promoter: "", client: "" });
                    }}
                  >
                    <option value="">Selecione a empresa/filial</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>{companyLabel(company)}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="field-label">Nome da rota</span>
                  <input
                    className="input-control"
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="field-label">Data inicial</span>
                    <input
                      className="input-control"
                      type="datetime-local"
                      value={form.startDate}
                      onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Data final</span>
                    <input
                      className="input-control"
                      type="datetime-local"
                      value={form.endDate}
                      onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slateText">
                <Users className="h-4 w-4" />
                Equipe da rota
              </div>
              <div className="space-y-3">
                <label className="block">
                  <span className="field-label">Supervisor</span>
                  <input
                    className="input-control mb-2"
                    type="search"
                    placeholder="Buscar supervisor por codigo ou nome"
                    value={filters.supervisor}
                    onChange={(event) => setFilters((current) => ({ ...current, supervisor: event.target.value }))}
                  />
                  <select
                    className="input-control"
                    value={form.supervisorId}
                    onChange={(event) => {
                      const supervisorId = event.target.value;
                      setForm((current) => {
                        const nextPromoterBelongsToSupervisor = promoters.some((promoter) =>
                          promoter.id === current.promoterId && promoter.supervisor?.id === supervisorId
                        );

                        return {
                          ...current,
                          supervisorId,
                          promoterId: supervisorId && nextPromoterBelongsToSupervisor ? current.promoterId : ""
                        };
                      });
                    }}
                  >
                    <option value="">Selecione um supervisor</option>
                    {filteredSupervisors.map((supervisor) => (
                      <option key={supervisor.id} value={supervisor.id}>{optionLabel(supervisor, "SUP")}</option>
                    ))}
                  </select>
                  <div className="mt-2 text-xs font-semibold text-stone-500">{filteredSupervisors.length} supervisor(es) disponiveis.</div>
                </label>

                <label className="block">
                  <span className="field-label">Promotor de vendas</span>
                  <input
                    className="input-control mb-2"
                    type="search"
                    placeholder="Buscar promotor por codigo, nome ou e-mail"
                    value={filters.promoter}
                    onChange={(event) => setFilters((current) => ({ ...current, promoter: event.target.value }))}
                  />
                  <select
                    className="input-control"
                    value={form.promoterId}
                    onChange={(event) => {
                      const promoterId = event.target.value;
                      setForm((current) => ({ ...current, promoterId }));

                      if (promoterId) {
                        const promoterClientIds = clients
                          .filter((client) => client.defaultPromoter?.id === promoterId)
                          .map((client) => client.id);

                        if (promoterClientIds.length > 0) {
                          setSelectedClientIds((current) => Array.from(new Set([...current, ...promoterClientIds])));
                        }
                      }
                    }}
                  >
                    <option value="">Selecione um promotor</option>
                    {filteredPromoters.map((promoter) => (
                      <option key={promoter.id} value={promoter.id}>{optionLabel(promoter, "PRO")}</option>
                    ))}
                  </select>
                  <div className="mt-2 text-xs font-semibold text-stone-500">{filteredPromoters.length} promotor(es) disponiveis.</div>
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slateText">
                  <Store className="h-4 w-4" />
                  Clientes da rota
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-graphite">{selectedClientIds.length} selecionado(s)</span>
              </div>

              <input
                className="input-control mb-3"
                type="search"
                placeholder="Buscar cliente por codigo, nome ou cidade"
                value={filters.client}
                onChange={(event) => setFilters((current) => ({ ...current, client: event.target.value }))}
              />

              <div className="mb-3 flex flex-wrap gap-2">
                {selectedClients.length === 0 ? (
                  <span className="text-sm font-semibold text-stone-500">Nenhum cliente selecionado.</span>
                ) : null}
                {selectedClients.map((client, index) => (
                  <button
                    key={client.id}
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-line bg-field px-3 py-2 text-xs font-black text-graphite"
                    onClick={() => toggleClient(client.id)}
                    title="Remover cliente"
                  >
                    {index + 1}. {client.name}
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {filteredClients.map((client) => {
                  const selected = selectedClientIds.includes(client.id);

                  return (
                    <button
                      key={client.id}
                      type="button"
                      className={`w-full rounded-xl border px-3 py-3 text-left text-sm font-bold transition ${
                        selected ? "border-moss bg-emerald-50 text-forest" : "border-line bg-white text-ink hover:bg-muted"
                      }`}
                      onClick={() => toggleClient(client.id)}
                    >
                      {clientLabel(client)}
                    </button>
                  );
                })}
                {filteredClients.length === 0 ? (
                  <p className="py-4 text-center text-sm font-semibold text-stone-500">Nenhum cliente encontrado.</p>
                ) : null}
              </div>
            </div>

            <button className="primary-button w-full" type="submit" title="Criar rota">
              <Plus className="h-4 w-4" />
              Criar rota com {selectedClientIds.length} cliente(s)
            </button>
          </div>
        </form>

        <div className="table-wrap">
          <div className="glass-strip border-b border-line/80 p-4">
            <div className="flex flex-col gap-3 lg:flex-row">
              <label className="block flex-1">
                <span className="field-label">Buscar rota, equipe, cliente ou situacao</span>
                <input
                  className="input-control"
                  type="search"
                  placeholder="Deixe em branco para listar todas as rotas"
                  value={routeSearch}
                  onChange={(event) => setRouteSearch(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="secondary-button h-12 min-w-[148px] self-end"
                onClick={() => setRouteSearch("")}
              >
                Limpar busca
              </button>
            </div>
            <div className="mt-2 text-xs font-semibold text-stone-500">
              {routeSearch.trim()
                ? `Exibindo ${filteredRoutes.length} rota(s) para a busca atual.`
                : `Exibindo ${filteredRoutes.length} rota(s). Busca vazia mostra todas as rotas.`}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rota</th>
                  <th>Periodo</th>
                  <th>Equipe</th>
                  <th>Situação</th>
                  <th>Clientes</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoutes.map((route) => (
                  <tr key={route.id}>
                    <td className="min-w-[220px]">
                      <div className="font-bold text-ink">{route.name}</div>
                      <div className="mt-1 text-xs font-semibold text-stone-500">{routeProgressText(route)}</div>
                    </td>
                    <td className="min-w-[220px] text-sm font-semibold text-stone-600">{formatRoutePeriod(route)}</td>
                    <td className="min-w-[220px]">
                      <div className="space-y-1 text-sm font-semibold text-stone-600">
                        <div><span className="font-black text-ink">Promotor:</span> {personLabel(route.promoter, "PRO")}</div>
                        <div><span className="font-black text-ink">Supervisor:</span> {personLabel(route.supervisor, "SUP")}</div>
                      </div>
                    </td>
                    <td className="min-w-[140px]">
                      <StatusPill value={routeOperationalStatus(route)} />
                    </td>
                    <td className="min-w-[120px]">
                      <div className="space-y-1">
                        <strong className="block text-base leading-tight text-ink">{route.items.length}</strong>
                        <span className="block text-xs font-semibold text-stone-500">cliente(s)</span>
                      </div>
                    </td>
                    <td className="min-w-[110px]">
                      {route.status === "DRAFT" ? (
                        <button className="icon-button text-moss" type="button" title="Publicar rota" onClick={() => void publish(route.id)}>
                          <Send className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-xs font-black uppercase tracking-[0.12em] text-stone-500">
                          {routeOperationalStatus(route) === "IN_PROGRESS" ? "Em rota" : "Sem acao"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRoutes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-stone-500">
                      {routeSearch.trim() ? "Nenhuma rota encontrada para a busca." : "Nenhuma rota encontrada."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

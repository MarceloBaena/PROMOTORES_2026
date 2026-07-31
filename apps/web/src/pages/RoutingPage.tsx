import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Route, Send, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { useAuth } from "../context/AuthContext";
import { apiJson } from "../lib/api";
import { companyLabel, type CompanyOption } from "../lib/company-options";

interface RoutePlan {
  id: string;
  name: string;
  status: string;
  scheduledDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  promoter?: { code?: number; user?: { name?: string } };
  supervisor?: { code?: number; user?: { name?: string } };
  items: Array<{
    id: string;
    sequence: number;
    client: { name: string; tradeName?: string | null };
  }>;
}

interface PersonOption {
  id: string;
  code?: number;
  companyId?: string | null;
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
  tradeName?: string | null;
  city?: string | null;
  state?: string | null;
  defaultPromoter?: {
    id?: string;
  } | null;
}

function personLabel(
  profile?: { code?: number; user?: { name?: string } },
  prefix: "PRO" | "SUP" = "PRO",
) {
  if (!profile) {
    return "-";
  }

  const code = Number(profile.code);
  const formattedCode =
    Number.isFinite(code) && code > 0
      ? `${prefix}-${String(code).padStart(4, "0")}`
      : null;
  const name = profile.user?.name ?? "Sem nome";

  return formattedCode ? `${formattedCode} - ${name}` : name;
}

function optionLabel(option: PersonOption, prefix: "PRO" | "SUP") {
  return personLabel(option, prefix);
}

function clientLabel(client: ClientOption) {
  const code = client.code ? `${client.code} - ` : "";
  const city = client.city
    ? ` (${client.city}${client.state ? `/${client.state}` : ""})`
    : "";
  const name = client.name || "Cliente sem nome";
  const tradeName = client.tradeName?.trim();
  const fantasy =
    tradeName && tradeName !== client.name ? ` | Fantasia: ${tradeName}` : "";
  return `${code}${name}${fantasy}${city}`;
}

function clientHeadline(client: ClientOption) {
  const code = client.code ? `${client.code} - ` : "";
  const tradeName = client.tradeName?.trim();
  const primaryName =
    tradeName && tradeName !== client.name
      ? tradeName
      : client.name || "Cliente sem nome";

  return `${code}${primaryName}`;
}

function clientSecondaryLine(client: ClientOption) {
  const details = [
    client.name && client.tradeName?.trim() !== client.name ? client.name : null,
    client.city
      ? `${client.city}${client.state ? `/${client.state}` : ""}`
      : null,
  ].filter(Boolean);

  return details.join(" | ");
}

function routeClientPrimaryName(client: RoutePlan["items"][number]["client"]) {
  const tradeName = client.tradeName?.trim();
  return tradeName || client.name || "Cliente sem nome";
}

function routeClientSecondaryName(client: RoutePlan["items"][number]["client"]) {
  const tradeName = client.tradeName?.trim();
  if (!tradeName || tradeName === client.name) {
    return null;
  }

  return client.name;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRoutePeriod(route: RoutePlan) {
  const start = route.startDate ?? route.scheduledDate;
  const end = route.endDate;

  if (!start && !end) {
    return "Periodo nao informado";
  }

  return `${formatDateTime(start)} ate ${formatDateTime(end)}`;
}

function formatRouteDuration(route: RoutePlan) {
  const startValue = route.startDate ?? route.scheduledDate;
  const endValue = route.endDate;

  if (!startValue || !endValue) {
    return "-";
  }

  const start = new Date(startValue);
  const end = new Date(endValue);
  const minutes = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 60000),
  );

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0 min";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} min`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}min`;
}

export function RoutingPage() {
  const { user } = useAuth();
  const [routes, setRoutes] = useState<RoutePlan[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [supervisors, setSupervisors] = useState<PersonOption[]>([]);
  const [promoters, setPromoters] = useState<PersonOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [form, setForm] = useState({
    name: "",
    startDate: "",
    endDate: "",
    companyId: user?.companyId ?? "",
    supervisorId: "",
    promoterId: "",
  });
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [clientOptionId, setClientOptionId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isPlatformAdmin = user?.role === "ADMIN" && !user.companyId;

  async function load() {
    setLoading(true);
    try {
      const [
        routesResponse,
        companiesResponse,
        supervisorsResponse,
        promotersResponse,
        clientsResponse,
      ] = await Promise.all([
        apiJson<{ data: RoutePlan[] }>("/routes"),
        apiJson<{ data: CompanyOption[] }>("/companies"),
        apiJson<{ data: PersonOption[] }>("/supervisors"),
        apiJson<{ data: PersonOption[] }>("/promoters"),
        apiJson<{ data: ClientOption[] }>("/clients"),
      ]);

      setRoutes(routesResponse.data);
      setCompanies(companiesResponse.data);
      setSupervisors(supervisorsResponse.data);
      setPromoters(promotersResponse.data);
      setClients(clientsResponse.data);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar a roteirizacao.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createRoute(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (!form.name.trim()) {
      setMessage("Informe o nome da rota.");
      return;
    }

    if (!form.startDate) {
      setMessage("Informe a data e hora inicial da rota.");
      return;
    }

    if (!form.endDate) {
      setMessage("Informe a data e hora final da rota.");
      return;
    }

    const startDate = new Date(form.startDate);
    const endDate = new Date(form.endDate);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      setMessage("As datas da rota sao invalidas.");
      return;
    }

    if (endDate < startDate) {
      setMessage("A data final precisa ser maior ou igual a data inicial.");
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
      const startDateIso = startDate.toISOString();
      const endDateIso = endDate.toISOString();

      await apiJson("/routes", {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(
            Object.entries(form).filter(([, value]) => value !== ""),
          ),
          scheduledDate: startDateIso,
          startDate: startDateIso,
          endDate: endDateIso,
          clientIds: selectedClientIds,
        }),
      });
      setForm({
        name: "",
        startDate: "",
        endDate: "",
        companyId: user?.companyId ?? "",
        supervisorId: "",
        promoterId: "",
      });
      setSelectedClientIds([]);
      setClientSearch("");
      setClientOptionId("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rota nao criada.");
    }
  }

  async function publish(id: string) {
    setMessage(null);
    try {
      await apiJson(`/routes/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: "PUBLISHED" }),
      });
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel publicar a rota.",
      );
    }
  }

  const filteredSupervisors = supervisors.filter(
    (supervisor) => !form.companyId || supervisor.companyId === form.companyId,
  );
  const filteredPromoters = promoters.filter(
    (promoter) => !form.companyId || promoter.companyId === form.companyId,
  );
  const supervisorOptions = filteredSupervisors.slice(0, 200);
  const promoterOptions = filteredPromoters.slice(0, 200);
  const filteredClients = clients.filter(
    (client) => !form.companyId || client.companyId === form.companyId,
  );
  const selectedClients = selectedClientIds
    .map((id) => clients.find((client) => client.id === id))
    .filter((client): client is ClientOption => Boolean(client));
  const routeClientOptions = useMemo(() => {
    const normalizedSearch = clientSearch.trim().toLowerCase();
    const availableClients = filteredClients.filter(
      (client) => !selectedClientIds.includes(client.id),
    );

    const matches = !normalizedSearch
      ? availableClients
      : availableClients.filter((client) => {
          const haystack = [
            client.code,
            client.name,
            client.tradeName,
            client.city,
            client.state,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(normalizedSearch);
        });

    return matches.slice(0, 8);
  }, [clientSearch, filteredClients, selectedClientIds]);

  useEffect(() => {
    if (routeClientOptions.length === 0) {
      setClientOptionId("");
      return;
    }

    setClientOptionId((current) =>
      current && routeClientOptions.some((client) => client.id === current)
        ? current
        : routeClientOptions[0]?.id ?? "",
    );
  }, [routeClientOptions]);

  const publishedCount = useMemo(
    () => routes.filter((route) => route.status === "PUBLISHED").length,
    [routes],
  );
  const completedCount = useMemo(
    () => routes.filter((route) => route.status === "COMPLETED").length,
    [routes],
  );
  const totalClientsInRoutes = useMemo(
    () => routes.reduce((total, route) => total + route.items.length, 0),
    [routes],
  );

  function toggleClient(clientId: string) {
    setSelectedClientIds((current) =>
      current.includes(clientId)
        ? current.filter((id) => id !== clientId)
        : [...current, clientId],
    );
  }

  return (
    <section>
      <PageHeader
        title="Roteirizacao"
        subtitle="Monte o roteiro do dia com equipe, clientes e publicacao operacional em um unico fluxo."
        action={
          <button
            className="secondary-button"
            type="button"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        }
      />

      {message ? <div className="notice notice-warning">{message}</div> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <RouteMetric
          label="Rotas no painel"
          value={routes.length}
          helper="Planejamento cadastrado neste ambiente."
          icon={Route}
        />
        <RouteMetric
          label="Publicadas"
          value={publishedCount}
          helper="Rotas prontas para a equipe no aplicativo."
          icon={Send}
        />
        <RouteMetric
          label="Concluidas"
          value={completedCount}
          helper="Rotas que ja encerraram sua jornada."
          icon={Users}
        />
        <RouteMetric
          label="Clientes em roteiro"
          value={totalClientsInRoutes}
          helper="Clientes somados em todas as rotas listadas."
          icon={Plus}
        />
      </div>

      <div className="space-y-4">
        <form
          onSubmit={createRoute}
          className="panel overflow-hidden"
        >
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Nova rota</h2>
              <p className="panel-subtitle">
                Defina a equipe e monte a jornada do promotor com os clientes da rota.
              </p>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="rounded-[1.35rem] border border-line bg-white p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slateText">
                    Dados da rota
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slateText">
                    Janela operacional, equipe e publicacao do dia.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-line bg-field px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
                    Inicio e fim obrigatorios
                  </span>
                  <span className="rounded-full border border-line bg-field px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
                    {selectedClientIds.length} cliente(s)
                  </span>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                <label className="block xl:col-span-2">
                  <span className="field-label">Empresa/Filial</span>
                  <select
                    className="input-control"
                    disabled={!isPlatformAdmin}
                    value={form.companyId}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        companyId: event.target.value,
                        supervisorId: "",
                        promoterId: "",
                      }));
                      setSelectedClientIds([]);
                      setClientSearch("");
                      setClientOptionId("");
                    }}
                  >
                    <option value="">Selecione a empresa/filial</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {companyLabel(company)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block xl:col-span-2">
                  <span className="field-label">Nome da rota</span>
                  <input
                    className="input-control"
                    type="text"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="field-label">Data/hora inicial</span>
                  <input
                    className="input-control"
                    type="datetime-local"
                    value={form.startDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        startDate: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="field-label">Data/hora final</span>
                  <input
                    className="input-control"
                    type="datetime-local"
                    value={form.endDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        endDate: event.target.value,
                      }))
                    }
                  />
                </label>

                <div className="space-y-2">
                  <label className="block">
                    <span className="field-label">Supervisor</span>
                    <select
                      className="input-control"
                      value={form.supervisorId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          supervisorId: event.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {supervisorOptions.length === 0
                          ? "Nenhum supervisor encontrado"
                          : "Selecione um supervisor"}
                      </option>
                      {supervisorOptions.map((supervisor) => (
                        <option key={supervisor.id} value={supervisor.id}>
                          {optionLabel(supervisor, "SUP")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="block">
                    <span className="field-label">Promotor de vendas</span>
                    <select
                      className="input-control"
                      value={form.promoterId}
                      onChange={(event) => {
                        const promoterId = event.target.value;
                        setForm((current) => ({ ...current, promoterId }));

                        if (promoterId) {
                          const promoterClientIds = clients
                            .filter(
                              (client) => client.defaultPromoter?.id === promoterId,
                            )
                            .map((client) => client.id);

                          if (promoterClientIds.length > 0) {
                            setSelectedClientIds((current) =>
                              Array.from(
                                new Set([...current, ...promoterClientIds]),
                              ),
                            );
                            setClientSearch("");
                            setClientOptionId("");
                          }
                        }
                      }}
                    >
                      <option value="">
                        {promoterOptions.length === 0
                          ? "Nenhum promotor encontrado"
                          : "Selecione um promotor"}
                      </option>
                      {promoterOptions.map((promoter) => (
                        <option key={promoter.id} value={promoter.id}>
                          {optionLabel(promoter, "PRO")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="rounded-[1.35rem] border border-line bg-white p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="field-label">Clientes selecionados</span>
                    <div className="mt-1 text-xs font-semibold text-slateText">
                      Ordem que sera usada no atendimento do promotor.
                    </div>
                  </div>
                  <span className="rounded-full bg-field px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
                    {selectedClients.length} cliente(s)
                  </span>
                </div>

                {selectedClients.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-line bg-field/60 px-4 py-6 text-center text-sm font-semibold text-stone-500">
                    Nenhum cliente selecionado.
                  </div>
                ) : (
                  <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                    {selectedClients.map((client, index) => {
                      const secondaryLine = clientSecondaryLine(client);

                      return (
                        <button
                          key={client.id}
                          type="button"
                          className="flex w-full items-start gap-3 rounded-2xl border border-line bg-white px-3 py-3 text-left transition hover:bg-muted"
                          onClick={() => toggleClient(client.id)}
                          title="Remover cliente"
                        >
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-50 px-2 text-[11px] font-black text-brand">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-sm font-black leading-6 text-ink">
                              {clientHeadline(client)}
                            </span>
                            {secondaryLine ? (
                              <span className="mt-1 block break-words text-xs font-semibold leading-5 text-slateText">
                                {secondaryLine}
                              </span>
                            ) : null}
                          </span>
                          <X className="mt-0.5 h-4 w-4 shrink-0 text-slateText" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-[1.35rem] border border-line bg-white p-3">
                <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-field px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
                      {filteredClients.length} disponivel(is)
                    </span>
                    {selectedClients.length > 0 ? (
                      <button
                        type="button"
                        className="rounded-full border border-line bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slateText transition hover:bg-muted"
                        onClick={() => setSelectedClientIds([])}
                      >
                        Limpar selecao
                      </button>
                    ) : null}
                  </div>
                </div>

                <label className="block">
                  <span className="field-label">Buscar cliente</span>
                  <input
                    className="input-control"
                    type="text"
                    value={clientSearch}
                    placeholder="Digite codigo, nome fantasia, razao social ou cidade"
                    onChange={(event) => setClientSearch(event.target.value)}
                  />
                </label>

                <div className="mt-3 rounded-2xl border border-line bg-field/60 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
                      Lista suspensa
                    </span>
                    <span className="text-[11px] font-bold text-slateText">
                      {routeClientOptions.length} opcao(oes)
                    </span>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                    <label className="block">
                      <span className="field-label">Cliente encontrado</span>
                      <select
                        className="input-control"
                        value={clientOptionId}
                        onChange={(event) => setClientOptionId(event.target.value)}
                        disabled={routeClientOptions.length === 0}
                      >
                        {routeClientOptions.length === 0 ? (
                          <option value="">
                            {clientSearch.trim()
                              ? "Nenhum cliente encontrado"
                              : "Digite para buscar clientes"}
                          </option>
                        ) : null}
                        {routeClientOptions.map((client) => (
                          <option key={client.id} value={client.id}>
                            {clientLabel(client)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      className="primary-button self-end"
                      disabled={!clientOptionId}
                      onClick={() => {
                        if (!clientOptionId) {
                          return;
                        }

                        toggleClient(clientOptionId);
                        setClientSearch("");
                        setClientOptionId("");
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Incluir cliente
                    </button>
                  </div>
                </div>

                {selectedClients.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedClients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        className="rounded-full border border-line bg-white px-3 py-2 text-xs font-black text-ink transition hover:bg-muted"
                        onClick={() => toggleClient(client.id)}
                        title="Remover cliente da rota"
                      >
                        {clientHeadline(client)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setForm({
                    name: "",
                    startDate: "",
                    endDate: "",
                    companyId: user?.companyId ?? "",
                    supervisorId: "",
                    promoterId: "",
                  });
                  setSelectedClientIds([]);
                  setClientSearch("");
                  setClientOptionId("");
                  setMessage(null);
                }}
              >
                Limpar formulario
              </button>
              <button
                className="primary-button sm:min-w-[18rem]"
                type="submit"
                title="Criar rota"
              >
                <Plus className="h-4 w-4" />
                Criar rota com {selectedClientIds.length} cliente(s)
              </button>
            </div>
          </div>
        </form>

        <div className="table-wrap">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Rotas do painel</h2>
              <p className="panel-subtitle">
                Acompanhe o que esta publicado, concluido e quais clientes fazem parte de cada jornada.
              </p>
            </div>
            <span className="rounded-full bg-field px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
              {routes.length} rota(s)
            </span>
          </div>

          <div className="space-y-3 p-4">
            {routes.map((route) => (
              <div
                key={route.id}
                className="rounded-[1.35rem] border border-line bg-white p-4 shadow-sm shadow-slate-900/5"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="text-base font-black leading-7 text-ink break-words">
                      {route.name}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-line bg-field px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
                        {route.items.length} cliente(s)
                      </span>
                      <span className="rounded-full border border-line bg-field px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
                        {formatRouteDuration(route)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start">
                    <StatusPill value={route.status} />
                    <button
                      className="icon-button text-moss"
                      type="button"
                      title="Publicar"
                      onClick={() => void publish(route.id)}
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-line bg-field/70 px-4 py-3">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <RouteInlineStat label="Periodo" value={formatRoutePeriod(route)} />
                    <RouteInlineStat label="Duracao" value={formatRouteDuration(route)} />
                    <RouteInlineStat label="Promotor" value={personLabel(route.promoter, "PRO")} />
                    <RouteInlineStat label="Supervisor" value={personLabel(route.supervisor, "SUP")} />
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-line bg-field p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
                      Clientes da rota
                    </div>
                    <div className="text-[11px] font-bold text-slateText">
                      {route.items.length} cliente(s)
                    </div>
                  </div>

                  {route.items.length > 0 ? (
                    <div className="mt-3 grid gap-2 xl:grid-cols-2">
                      {route.items.map((item) => {
                        const primaryName = routeClientPrimaryName(item.client);
                        const secondaryName = routeClientSecondaryName(
                          item.client,
                        );

                        return (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-line bg-white px-3 py-3 shadow-sm shadow-slate-900/5"
                          >
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-blue-50 px-2 text-[11px] font-black text-brand">
                                {item.sequence}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="break-words text-sm font-black leading-6 text-ink">
                                    {primaryName}
                                  </div>
                                  <span className="rounded-full bg-field px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
                                    Parada {item.sequence}
                                  </span>
                                </div>
                                {secondaryName ? (
                                  <div className="mt-1 text-xs font-semibold leading-5 text-slateText break-words">
                                    Razao social: {secondaryName}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm font-semibold text-stone-500">
                      Sem clientes vinculados nesta rota.
                    </div>
                  )}
                </div>
              </div>
            ))}

            {routes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-white px-4 py-8 text-center text-sm font-semibold text-stone-500">
                Nenhuma rota encontrada.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function RouteMetric({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: number;
  helper: string;
  icon: LucideIcon;
}) {
  return (
    <div className="metric-card">
      <div className="relative z-[1] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
            {label}
          </div>
          <div className="mt-3 font-display text-3xl font-bold text-ink">
            {value}
          </div>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-brand">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="relative z-[1] mt-2 text-xs font-bold leading-5 text-slateText">
        {helper}
      </div>
    </div>
  );
}

function RouteInlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
        {label}
      </div>
      <div className="mt-1 break-words text-xs font-bold leading-5 text-ink">{value}</div>
    </div>
  );
}

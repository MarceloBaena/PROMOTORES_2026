import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Route, Send, Users, X } from "lucide-react";
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
  const filteredClients = clients.filter(
    (client) => !form.companyId || client.companyId === form.companyId,
  );
  const selectedClients = selectedClientIds
    .map((id) => clients.find((client) => client.id === id))
    .filter((client): client is ClientOption => Boolean(client));
  const selectedCompany = companies.find((company) => company.id === form.companyId);
  const selectedPromoter = filteredPromoters.find(
    (promoter) => promoter.id === form.promoterId,
  );

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

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="grid gap-4 xl:grid-cols-[460px_minmax(0,1fr)]">
        <form
          onSubmit={createRoute}
          className="panel overflow-hidden xl:sticky xl:top-20 xl:self-start"
        >
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Nova rota</h2>
              <p className="panel-subtitle">
                Selecione empresa, equipe e clientes sem precisar decorar
                codigos internos.
              </p>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-line bg-field px-3 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
                  Empresa
                </div>
                <div className="mt-1 text-sm font-black text-ink">
                  {selectedCompany ? companyLabel(selectedCompany) : "Nao selecionada"}
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-field px-3 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
                  Equipe
                </div>
                <div className="mt-1 text-sm font-black text-ink">
                  {selectedPromoter
                    ? optionLabel(selectedPromoter, "PRO")
                    : "Promotor nao definido"}
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-field px-3 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
                  Clientes
                </div>
                <div className="mt-1 text-sm font-black text-ink">
                  {selectedClientIds.length} selecionado(s)
                </div>
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-line bg-white p-4">
              <div className="mb-3">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slateText">
                  Dados da rota
                </div>
                <div className="mt-1 text-xs font-semibold text-slateText">
                  Configure empresa, janela operacional e equipe responsavel.
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block md:col-span-2">
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

                <label className="block md:col-span-2">
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
                    <option value="">Selecione um supervisor</option>
                    {filteredSupervisors.map((supervisor) => (
                      <option key={supervisor.id} value={supervisor.id}>
                        {optionLabel(supervisor, "SUP")}
                      </option>
                    ))}
                  </select>
                </label>

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
                        }
                      }
                    }}
                  >
                    <option value="">Selecione um promotor</option>
                    {filteredPromoters.map((promoter) => (
                      <option key={promoter.id} value={promoter.id}>
                        {optionLabel(promoter, "PRO")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-line bg-white p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="field-label">Clientes do roteiro</span>
                  <div className="mt-1 text-xs font-semibold text-slateText">
                    Marque os clientes que farão parte da jornada desta rota.
                  </div>
                </div>
                <span className="rounded-full bg-field px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
                  {filteredClients.length} disponivel(is)
                </span>
              </div>

              <span className="field-label">Clientes do roteiro</span>
              <div className="mb-3 flex flex-wrap gap-2">
                {selectedClients.length === 0 ? (
                  <span className="text-sm font-semibold text-stone-500">
                    Nenhum cliente selecionado.
                  </span>
                ) : null}
                {selectedClients.map((client, index) => (
                  <button
                    key={client.id}
                    type="button"
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-field px-3 py-2 text-left text-xs font-black text-graphite"
                    onClick={() => toggleClient(client.id)}
                    title="Remover cliente"
                  >
                    <span className="truncate">
                      {index + 1}. {clientHeadline(client)}
                    </span>
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {filteredClients.map((client) => {
                  const selected = selectedClientIds.includes(client.id);
                  const secondaryLine = clientSecondaryLine(client);

                  return (
                    <button
                      key={client.id}
                      type="button"
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-moss bg-emerald-50 text-forest"
                          : "border-line bg-white text-ink hover:bg-muted"
                      }`}
                      onClick={() => toggleClient(client.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-black text-current">
                            {clientHeadline(client)}
                          </div>
                          {secondaryLine ? (
                            <div className="mt-1 text-xs font-semibold text-slateText">
                              {secondaryLine}
                            </div>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                            selected
                              ? "bg-white/80 text-forest"
                              : "bg-field text-slateText"
                          }`}
                        >
                          {selected ? "Selecionado" : "Disponivel"}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {filteredClients.length === 0 ? (
                  <p className="py-4 text-center text-sm font-semibold text-stone-500">
                    Nenhum cliente encontrado.
                  </p>
                ) : null}
              </div>
            </div>

            <button
              className="primary-button w-full"
              type="submit"
              title="Criar rota"
            >
              <Plus className="h-4 w-4" />
              Criar rota com {selectedClientIds.length} cliente(s)
            </button>
          </div>
        </form>

        <div className="table-wrap">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Rotas do painel</h2>
              <p className="panel-subtitle">
                Resumo da equipe planejada, quantidade de clientes e publicacao
                para o aplicativo.
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-black text-ink">
                      {route.name}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-slateText">
                      {route.items.length} cliente(s) vinculados
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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

                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <RouteInfo label="Periodo" value={formatRoutePeriod(route)} />
                  <RouteInfo label="Duracao" value={formatRouteDuration(route)} />
                  <RouteInfo
                    label="Promotor"
                    value={personLabel(route.promoter, "PRO")}
                  />
                  <RouteInfo
                    label="Supervisor"
                    value={personLabel(route.supervisor, "SUP")}
                  />
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
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                      {route.items.map((item) => {
                        const secondaryName = routeClientSecondaryName(
                          item.client,
                        );

                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-line bg-white px-3 py-2"
                          >
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-50 px-1.5 text-[10px] font-black text-brand">
                                {item.sequence}
                              </span>
                              <div className="min-w-0">
                                <div className="text-sm font-black leading-5 text-ink">
                                  {routeClientPrimaryName(item.client)}
                                </div>
                                {secondaryName ? (
                                  <div className="mt-1 text-xs font-semibold text-slateText">
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
  icon: typeof Route;
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

function RouteInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-field px-3 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">
        {label}
      </div>
      <div className="mt-1 text-xs font-bold leading-5 text-ink">{value}</div>
    </div>
  );
}

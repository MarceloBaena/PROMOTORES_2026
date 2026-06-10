import { FormEvent, useEffect, useState } from "react";
import { Plus, Send, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { apiJson } from "../lib/api";

interface RoutePlan {
  id: string;
  name: string;
  status: string;
  promoter?: { code?: number; user?: { name?: string } };
  supervisor?: { code?: number; user?: { name?: string } };
  items: Array<{ id: string; sequence: number; client: { name: string } }>;
}

interface PersonOption {
  id: string;
  code?: number;
  user?: {
    name?: string;
    email?: string;
  };
}

interface ClientOption {
  id: string;
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

export function RoutingPage() {
  const [routes, setRoutes] = useState<RoutePlan[]>([]);
  const [supervisors, setSupervisors] = useState<PersonOption[]>([]);
  const [promoters, setPromoters] = useState<PersonOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [form, setForm] = useState({ name: "", scheduledDate: "", supervisorId: "", promoterId: "" });
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [filters, setFilters] = useState({ supervisor: "", promoter: "", client: "" });
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [routesResponse, supervisorsResponse, promotersResponse, clientsResponse] = await Promise.all([
      apiJson<{ data: RoutePlan[] }>("/routes"),
      apiJson<{ data: PersonOption[] }>("/supervisors"),
      apiJson<{ data: PersonOption[] }>("/promoters"),
      apiJson<{ data: ClientOption[] }>("/clients")
    ]);

    setRoutes(routesResponse.data);
    setSupervisors(supervisorsResponse.data);
    setPromoters(promotersResponse.data);
    setClients(clientsResponse.data);
  }

  useEffect(() => {
    load().catch((error: Error) => setMessage(error.message));
  }, []);

  async function createRoute(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (!form.name.trim()) {
      setMessage("Informe o nome da rota.");
      return;
    }

    if (!form.scheduledDate) {
      setMessage("Informe a data da rota.");
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
          scheduledDate: form.scheduledDate ? new Date(form.scheduledDate).toISOString() : undefined,
          clientIds: selectedClientIds
        })
      });
      setForm({ name: "", scheduledDate: "", supervisorId: "", promoterId: "" });
      setSelectedClientIds([]);
      setFilters({ supervisor: "", promoter: "", client: "" });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rota não criada.");
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
    optionLabel(supervisor, "SUP").toLowerCase().includes(filters.supervisor.toLowerCase())
  );
  const filteredPromoters = promoters.filter((promoter) =>
    optionLabel(promoter, "PRO").toLowerCase().includes(filters.promoter.toLowerCase())
  );
  const filteredClients = clients.filter((client) =>
    clientLabel(client).toLowerCase().includes(filters.client.toLowerCase())
  );
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
      <PageHeader title="Roteirização" />
      {message ? <div className="notice notice-warning">{message}</div> : null}
      <div className="grid gap-4 xl:grid-cols-[440px_minmax(0,1fr)]">
        <form onSubmit={createRoute} className="panel overflow-hidden xl:sticky xl:top-20 xl:self-start">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Nova rota</h2>
              <p className="panel-subtitle">Selecione equipe e clientes sem digitar códigos internos.</p>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <label className="block">
              <span className="field-label">Nome</span>
              <input
                className="input-control"
                type="text"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="field-label">Data</span>
              <input
                className="input-control"
                type="datetime-local"
                value={form.scheduledDate}
                onChange={(event) => setForm((current) => ({ ...current, scheduledDate: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="field-label">Supervisor</span>
              <input
                className="input-control mb-2"
                type="search"
                placeholder="Buscar supervisor por código ou nome"
                value={filters.supervisor}
                onChange={(event) => setFilters((current) => ({ ...current, supervisor: event.target.value }))}
              />
              <select
                className="input-control"
                value={form.supervisorId}
                onChange={(event) => setForm((current) => ({ ...current, supervisorId: event.target.value }))}
              >
                <option value="">Selecione um supervisor</option>
                {filteredSupervisors.map((supervisor) => (
                  <option key={supervisor.id} value={supervisor.id}>{optionLabel(supervisor, "SUP")}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Promotor de vendas</span>
              <input
                className="input-control mb-2"
                type="search"
                placeholder="Buscar promotor por código, nome ou e-mail"
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
            </label>
            <div className="rounded-2xl border border-line bg-white p-3">
              <span className="field-label">Clientes</span>
              <input
                className="input-control mb-3"
                type="search"
                placeholder="Buscar cliente por código, nome ou cidade"
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
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 py-3">Rota</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Promotor</th>
                  <th className="px-4 py-3">Clientes</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((route) => (
                  <tr key={route.id}>
                    <td className="px-4 py-3 font-medium">{route.name}</td>
                    <td className="px-4 py-3"><StatusPill value={route.status} /></td>
                    <td className="px-4 py-3">{personLabel(route.promoter, "PRO")}</td>
                    <td className="px-4 py-3">{route.items.length}</td>
                    <td className="px-4 py-3">
                      <button className="icon-button text-moss" type="button" title="Publicar" onClick={() => void publish(route.id)}>
                        <Send className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {routes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-stone-500">Nenhuma rota encontrada.</td>
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

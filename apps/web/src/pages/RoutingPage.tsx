import { FormEvent, useEffect, useState } from "react";
import { Plus, Send } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { apiJson } from "../lib/api";

interface RoutePlan {
  id: string;
  name: string;
  status: string;
  promoter?: { user?: { name?: string } };
  supervisor?: { user?: { name?: string } };
  items: Array<{ id: string; sequence: number; client: { name: string } }>;
}

export function RoutingPage() {
  const [routes, setRoutes] = useState<RoutePlan[]>([]);
  const [form, setForm] = useState({ name: "", scheduledDate: "", supervisorId: "", promoterId: "", clientIds: "" });
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await apiJson<{ data: RoutePlan[] }>("/routes");
    setRoutes(response.data);
  }

  useEffect(() => {
    load().catch((error: Error) => setMessage(error.message));
  }, []);

  async function createRoute(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    try {
      await apiJson("/routes", {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(Object.entries(form).filter(([, value]) => value !== "")),
          scheduledDate: form.scheduledDate ? new Date(form.scheduledDate).toISOString() : undefined,
          clientIds: form.clientIds.split(",").map((item) => item.trim()).filter(Boolean)
        })
      });
      setForm({ name: "", scheduledDate: "", supervisorId: "", promoterId: "", clientIds: "" });
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

  return (
    <section>
      <PageHeader title="Roteirizacao" />
      {message ? <div className="notice notice-warning">{message}</div> : null}
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <form onSubmit={createRoute} className="panel overflow-hidden xl:sticky xl:top-20 xl:self-start">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Nova rota</h2>
            </div>
          </div>
          <div className="space-y-3 p-4">
            {[
              ["name", "Nome"],
              ["scheduledDate", "Data"],
              ["supervisorId", "Supervisor ID"],
              ["promoterId", "Promotor ID"],
              ["clientIds", "Clientes IDs"]
            ].map(([name, label]) => (
              <label key={name} className="block">
                <span className="field-label">{label}</span>
                <input
                  className="input-control"
                  type={name === "scheduledDate" ? "datetime-local" : "text"}
                  value={form[name as keyof typeof form]}
                  onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
                />
              </label>
            ))}
            <button className="primary-button w-full" type="submit" title="Criar rota">
              <Plus className="h-4 w-4" />
              Criar rota
            </button>
          </div>
        </form>

        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 py-3">Rota</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Promotor</th>
                  <th className="px-4 py-3">Clientes</th>
                  <th className="px-4 py-3">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((route) => (
                  <tr key={route.id}>
                    <td className="px-4 py-3 font-medium">{route.name}</td>
                    <td className="px-4 py-3"><StatusPill value={route.status} /></td>
                    <td className="px-4 py-3">{route.promoter?.user?.name ?? "-"}</td>
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

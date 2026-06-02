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
      {message ? <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{message}</div> : null}
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form onSubmit={createRoute} className="rounded-lg border border-line bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-base font-bold">Nova rota</h2>
          {[
            ["name", "Nome"],
            ["scheduledDate", "Data"],
            ["supervisorId", "Supervisor ID"],
            ["promoterId", "Promotor ID"],
            ["clientIds", "Clientes IDs"]
          ].map(([name, label]) => (
            <label key={name} className="mb-3 block">
              <span className="mb-1 block text-sm font-semibold">{label}</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3"
                type={name === "scheduledDate" ? "datetime-local" : "text"}
                value={form[name as keyof typeof form]}
                onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
              />
            </label>
          ))}
          <button className="focus-ring inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-moss px-4 text-sm font-semibold text-white" type="submit" title="Criar rota">
            <Plus className="h-4 w-4" />
            Criar rota
          </button>
        </form>

        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-field text-xs uppercase text-stone-500">
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
                  <tr key={route.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">{route.name}</td>
                    <td className="px-4 py-3"><StatusPill value={route.status} /></td>
                    <td className="px-4 py-3">{route.promoter?.user?.name ?? "-"}</td>
                    <td className="px-4 py-3">{route.items.length}</td>
                    <td className="px-4 py-3">
                      <button className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-line text-moss" type="button" title="Publicar" onClick={() => void publish(route.id)}>
                        <Send className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

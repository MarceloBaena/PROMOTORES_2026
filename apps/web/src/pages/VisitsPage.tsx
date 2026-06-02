import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { apiJson } from "../lib/api";

interface Visit {
  id: string;
  status: string;
  notes?: string;
  client: { name: string };
  promoter?: { user?: { name?: string } };
  createdAt: string;
}

export function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [form, setForm] = useState({ clientId: "", promoterId: "", routeId: "", notes: "" });
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await apiJson<{ data: Visit[] }>("/visits");
    setVisits(response.data);
  }

  useEffect(() => {
    load().catch((error: Error) => setMessage(error.message));
  }, []);

  async function createVisit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    try {
      await apiJson("/visits", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(Object.entries(form).filter(([, value]) => value !== "")))
      });
      setForm({ clientId: "", promoterId: "", routeId: "", notes: "" });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Visita nao criada.");
    }
  }

  async function completeVisit(id: string) {
    await apiJson(`/visits/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        status: "completed",
        finishedAt: new Date().toISOString()
      })
    });
    await load();
  }

  return (
    <section>
      <PageHeader title="Visitas" />
      {message ? <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{message}</div> : null}
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <form onSubmit={createVisit} className="rounded-lg border border-line bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-base font-bold">Nova visita</h2>
          {[
            ["clientId", "Cliente ID"],
            ["promoterId", "Promotor ID"],
            ["routeId", "Rota ID"],
            ["notes", "Observacoes"]
          ].map(([name, label]) => (
            <label key={name} className="mb-3 block">
              <span className="mb-1 block text-sm font-semibold">{label}</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3"
                value={form[name as keyof typeof form]}
                onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
              />
            </label>
          ))}
          <button className="focus-ring inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-moss px-4 text-sm font-semibold text-white" type="submit" title="Criar visita">
            <Plus className="h-4 w-4" />
            Criar visita
          </button>
        </form>

        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-field text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Promotor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Criada em</th>
                  <th className="px-4 py-3">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => (
                  <tr key={visit.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">{visit.client.name}</td>
                    <td className="px-4 py-3">{visit.promoter?.user?.name ?? "-"}</td>
                    <td className="px-4 py-3"><StatusPill value={visit.status} /></td>
                    <td className="px-4 py-3">{new Date(visit.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3">
                      <button className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-line text-moss" type="button" title="Concluir" onClick={() => void completeVisit(visit.id)}>
                        <CheckCircle2 className="h-4 w-4" />
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

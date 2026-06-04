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
  promoter?: { code?: number; user?: { name?: string } };
  createdAt: string;
}

function promoterLabel(promoter?: Visit["promoter"]) {
  if (!promoter) {
    return "-";
  }

  const code = Number(promoter.code);
  const formattedCode = Number.isFinite(code) && code > 0 ? `PRO-${String(code).padStart(4, "0")}` : null;
  const name = promoter.user?.name ?? "Sem nome";

  return formattedCode ? `${formattedCode} - ${name}` : name;
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
      {message ? <div className="notice notice-warning">{message}</div> : null}
      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <form onSubmit={createVisit} className="panel overflow-hidden xl:sticky xl:top-20 xl:self-start">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Nova visita</h2>
            </div>
          </div>
          <div className="space-y-3 p-4">
            {[
              ["clientId", "Cliente ID"],
              ["promoterId", "Promotor ID"],
              ["routeId", "Rota ID"],
              ["notes", "Observacoes"]
            ].map(([name, label]) => (
              <label key={name} className="block">
                <span className="field-label">{label}</span>
                <input
                  className="input-control"
                  value={form[name as keyof typeof form]}
                  onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
                />
              </label>
            ))}
            <button className="primary-button w-full" type="submit" title="Criar visita">
              <Plus className="h-4 w-4" />
              Criar visita
            </button>
          </div>
        </form>

        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
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
                  <tr key={visit.id}>
                    <td className="px-4 py-3 font-medium">{visit.client.name}</td>
                    <td className="px-4 py-3">{promoterLabel(visit.promoter)}</td>
                    <td className="px-4 py-3"><StatusPill value={visit.status} /></td>
                    <td className="px-4 py-3">{new Date(visit.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3">
                      <button className="icon-button text-moss" type="button" title="Concluir" onClick={() => void completeVisit(visit.id)}>
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {visits.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-stone-500">Nenhuma visita encontrada.</td>
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

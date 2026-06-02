import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, Edit3, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { apiJson } from "../lib/api";

interface Field {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "select";
  options?: string[];
}

interface CrudPageProps {
  title: string;
  endpoint: string;
  fields: Field[];
  columns: Array<{
    label: string;
    value: (item: Record<string, unknown>) => ReactNode;
  }>;
  initialValues: Record<string, string>;
}

export function CrudPage({ title, endpoint, fields, columns, initialValues }: CrudPageProps) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState(initialValues);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const actionLabel = useMemo(() => (editingId ? "Salvar" : "Criar"), [editingId]);

  async function load() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await apiJson<{ data: Array<Record<string, unknown>> }>(endpoint);
      setItems(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [endpoint]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ""));

    try {
      await apiJson(editingId ? `${endpoint}/${editingId}` : endpoint, {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      setForm(initialValues);
      setEditingId(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operacao nao concluida.");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    setLoading(true);
    setMessage(null);

    try {
      await apiJson(`${endpoint}/${id}`, { method: "DELETE" });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel remover.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <PageHeader
        title={title}
        action={
          <button
            type="button"
            title="Atualizar"
            onClick={() => void load()}
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold"
          >
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </button>
        }
      />

      {message ? <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{message}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-field text-xs uppercase text-stone-500">
                <tr>
                  {columns.map((column) => (
                    <th key={column.label} className="px-4 py-3">{column.label}</th>
                  ))}
                  <th className="w-28 px-4 py-3">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={String(item.id)} className="border-t border-line align-top">
                    {columns.map((column) => (
                      <td key={column.label} className="px-4 py-3">{column.value(item)}</td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          title="Editar"
                          className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-line text-stone-700"
                          onClick={() => {
                            setEditingId(String(item.id));
                            setForm(fields.reduce<Record<string, string>>((acc, field) => {
                              const value = field.name.split(".").reduce<unknown>((current, key) => {
                                if (current && typeof current === "object") {
                                  return (current as Record<string, unknown>)[key];
                                }
                                return undefined;
                              }, item);
                              acc[field.name] = typeof value === "string" ? value : "";
                              return acc;
                            }, { ...initialValues }));
                          }}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Inativar"
                          className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-line text-berry"
                          onClick={() => void remove(String(item.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-stone-500" colSpan={columns.length + 1}>
                      {loading ? "Carregando..." : "Nenhum registro encontrado."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <form onSubmit={onSubmit} className="rounded-lg border border-line bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold">{editingId ? "Editar registro" : "Novo registro"}</h2>
            {editingId ? (
              <button
                type="button"
                title="Cancelar"
                className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-line"
                onClick={() => {
                  setEditingId(null);
                  setForm(initialValues);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="space-y-3">
            {fields.map((field) => (
              <label key={field.name} className="block">
                <span className="mb-1 block text-sm font-semibold">{field.label}</span>
                {field.type === "select" ? (
                  <select
                    className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3"
                    value={form[field.name] ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}
                  >
                    <option value="">-</option>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3"
                    type={field.type ?? "text"}
                    value={form[field.name] ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}
                  />
                )}
              </label>
            ))}
          </div>

          <button
            type="submit"
            title={actionLabel}
            disabled={loading}
            className="focus-ring mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-moss px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {actionLabel}
          </button>
        </form>
      </div>
    </section>
  );
}

export function userName(item: Record<string, unknown>) {
  const user = item.user as { name?: string; email?: string } | undefined;
  return user?.name ?? "-";
}

export function userEmail(item: Record<string, unknown>) {
  const user = item.user as { email?: string } | undefined;
  return user?.email ?? "-";
}

export function userStatus(item: Record<string, unknown>) {
  const user = item.user as { status?: string } | undefined;
  return <StatusPill value={String(item.status ?? user?.status ?? "")} />;
}

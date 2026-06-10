import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, Edit3, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { apiJson } from "../lib/api";

interface Field {
  name: string;
  label: string;
  source?: string;
  type?: "text" | "email" | "password" | "select" | "search";
  options?: Array<string | { value: string; label: string }>;
  placeholder?: string;
  description?: string;
  noSubmit?: boolean;
  fullWidth?: boolean;
  searchable?: boolean;
  readOnly?: boolean;
  required?: boolean;
  minLength?: number;
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
  const [searchFilters, setSearchFilters] = useState<Record<string, string>>({});

  const actionLabel = useMemo(() => (editingId ? "Alterar" : "Incluir"), [editingId]);
  const formTitle = useMemo(() => {
    if (title === "Clientes") {
      return editingId ? "Alterar ficha do cliente" : "Incluir cliente";
    }

    return editingId ? "Alterar registro" : "Incluir registro";
  }, [editingId, title]);

  async function load() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await apiJson<{ data: Array<Record<string, unknown>> }>(endpoint);
      setItems(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [endpoint]);

  function validateForm() {
    for (const field of fields) {
      const value = form[field.name]?.trim() ?? "";

      if (field.required && value === "") {
        return `Preencha o campo ${field.label}.`;
      }

      if (field.minLength && value !== "" && value.length < field.minLength) {
        return `${field.label} precisa ter pelo menos ${field.minLength} caracteres.`;
      }

      if (field.type === "email" && value !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return `Informe um e-mail valido em ${field.label}.`;
      }
    }

    return null;
  }

  function valueFromPath(item: Record<string, unknown>, path: string) {
    return path.split(".").reduce<unknown>((current, key) => {
      if (current && typeof current === "object") {
        return (current as Record<string, unknown>)[key];
      }

      return undefined;
    }, item);
  }

  function formFromItem(item: Record<string, unknown>) {
    return fields.reduce<Record<string, string>>((acc, field) => {
      if (field.type === "password") {
        acc[field.name] = "";
        return acc;
      }

      const value = valueFromPath(item, field.source ?? field.name) ?? valueFromPath(item, field.name);
      acc[field.name] = value == null ? "" : String(value);
      return acc;
    }, { ...initialValues });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    const validationMessage = validateForm();

    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setLoading(true);

    const payload = Object.fromEntries(
      Object.entries(form).filter(([key, value]) => {
        const field = fields.find((field) => field.name === key);
        return value !== "" && !field?.noSubmit;
      })
    );

    try {
      await apiJson(editingId ? `${endpoint}/${editingId}` : endpoint, {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      setForm(initialValues);
      setEditingId(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operação não concluída.");
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
      setMessage(error instanceof Error ? error.message : "Não foi possível remover.");
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
            className="secondary-button"
          >
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </button>
        }
      />

      {message ? <div className="notice notice-warning">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.label} className="px-4 py-3">{column.label}</th>
                  ))}
                  <th className="w-56 px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={String(item.id)} className="align-top">
                    {columns.map((column) => (
                      <td key={column.label} className="px-4 py-3">{column.value(item)}</td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          title="Alterar"
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-xs font-black uppercase tracking-[0.08em] text-graphite shadow-sm transition hover:-translate-y-0.5 hover:bg-muted"
                          onClick={() => {
                            setEditingId(String(item.id));
                            setForm(formFromItem(item));
                          }}
                        >
                          <Edit3 className="h-4 w-4" />
                          Alterar
                        </button>
                        <button
                          type="button"
                          title="Excluir"
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-xs font-black uppercase tracking-[0.08em] text-berry shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-50"
                          onClick={() => {
                            if (window.confirm("Deseja excluir/inativar este registro?")) {
                              void remove(String(item.id));
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
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

        <form onSubmit={onSubmit} className="panel overflow-hidden xl:sticky xl:top-20 xl:self-start">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{formTitle}</h2>
              {title === "Clientes" ? (
                <p className="panel-subtitle">Cadastro completo para roteiro e atendimento em campo.</p>
              ) : null}
            </div>
            {editingId ? (
              <button
                type="button"
                title="Cancelar"
                className="icon-button"
                onClick={() => {
                  setEditingId(null);
                  setForm(initialValues);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              {fields.map((field) => {
                const wrapperClass = field.fullWidth ? "sm:col-span-2" : "";
                const labelClass = `block ${wrapperClass}`.trim();
                const selectOptions = field.options ?? [];
                const filteredOptions = field.searchable && searchFilters[field.name]
                  ? selectOptions.filter((option) => {
                      const label = typeof option === "string" ? option : option.label;
                      return label.toLowerCase().includes(searchFilters[field.name].toLowerCase());
                    })
                  : selectOptions;

                return (
                  <label key={field.name} className={labelClass}>
                    <span className="field-label">{field.label}</span>
                    {field.searchable ? (
                      <input
                        className="input-control mb-3"
                        type="search"
                        placeholder={`Buscar ${field.label.toLowerCase()}`}
                        value={searchFilters[field.name] ?? ""}
                        onChange={(event) =>
                          setSearchFilters((current) => ({
                            ...current,
                            [field.name]: event.target.value
                          }))
                        }
                      />
                    ) : null}
                    {field.type === "select" ? (
                      <select
                        className="input-control"
                        value={form[field.name] ?? ""}
                        onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}
                      >
                        <option value="">{field.placeholder ?? "-"}</option>
                        {filteredOptions.map((option) => {
                          const value = typeof option === "string" ? option : option.value;
                          const label = typeof option === "string" ? option : option.label;
                          return (
                            <option key={value} value={value}>{label}</option>
                          );
                        })}
                      </select>
                    ) : (
                      <input
                        className="input-control"
                        type={field.type ?? "text"}
                        placeholder={field.placeholder}
                        readOnly={field.readOnly}
                        value={form[field.name] ?? ""}
                        onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}
                      />
                    )}
                    {field.description ? (
                      <p className="mt-2 text-sm text-stone-500">{field.description}</p>
                    ) : null}
                  </label>
                );
              })}
            </div>

            <button type="submit" title={actionLabel} disabled={loading} className="primary-button mt-5 w-full">
              {editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {actionLabel}
            </button>
          </div>
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

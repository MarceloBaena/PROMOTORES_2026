import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, Edit3, Plus, RefreshCcw, Search, Trash2, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { apiJson } from "../lib/api";

type FieldOption = string | { value: string; label: string };
type FieldValue = string | string[];

interface Field {
  name: string;
  label: string;
  source?: string;
  type?: "text" | "email" | "password" | "select" | "search" | "multiselect" | "tags";
  options?: FieldOption[];
  placeholder?: string;
  description?: string;
  noSubmit?: boolean;
  fullWidth?: boolean;
  searchable?: boolean;
  readOnly?: boolean;
  required?: boolean;
  minLength?: number;
}

interface FieldSection {
  title: string;
  description?: string;
  fields: string[];
  columns?: 1 | 2;
}

interface CrudPageProps {
  title: string;
  subtitle?: string;
  endpoint: string;
  fields: Field[];
  columns: Array<{
    label: string;
    value: (item: Record<string, unknown>) => ReactNode;
    className?: string;
    headerClassName?: string;
  }>;
  initialValues: Record<string, FieldValue>;
  searchHint?: string;
  searchPlaceholder?: string;
  formSubtitle?: string;
  formMode?: "panel" | "drawer";
  fieldSections?: FieldSection[];
  createTitle?: string;
  editTitle?: string;
  createButtonLabel?: string;
}

export function CrudPage({
  title,
  subtitle,
  endpoint,
  fields,
  columns,
  initialValues,
  searchHint,
  searchPlaceholder,
  formSubtitle,
  formMode = "panel",
  fieldSections,
  createTitle,
  editTitle,
  createButtonLabel
}: CrudPageProps) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState<Record<string, FieldValue>>(initialValues);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [searchFilters, setSearchFilters] = useState<Record<string, string>>({});
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});

  const filteredItems = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();

    if (!search) {
      return items;
    }

    return items.filter((item) => JSON.stringify(item).toLowerCase().includes(search));
  }, [items, tableSearch]);

  const resolvedSearchPlaceholder =
    searchPlaceholder ??
    (title === "Clientes"
      ? "Buscar cliente por codigo, nome, documento, endereco, bairro, cidade, empresa ou promotor"
      : `Buscar em ${title.toLowerCase()}`);

  const resolvedFormTitle = useMemo(() => {
    if (editingId) {
      return editTitle ?? (title === "Clientes" ? "Alterar ficha do cliente" : "Alterar registro");
    }

    return createTitle ?? (title === "Clientes" ? "Incluir cliente" : "Incluir registro");
  }, [createTitle, editTitle, editingId, title]);

  const actionLabel = useMemo(() => {
    if (editingId) {
      return "Salvar alteracao";
    }

    return createButtonLabel ?? "Incluir";
  }, [createButtonLabel, editingId]);

  const sections = useMemo(() => {
    if (fieldSections && fieldSections.length > 0) {
      return fieldSections;
    }

    return [
      {
        title: "Dados do cadastro",
        description: "Preencha os campos abaixo e confirme a gravacao.",
        fields: fields.map((field) => field.name),
        columns: 2 as const
      }
    ];
  }, [fieldSections, fields]);

  const fieldMap = useMemo(() => {
    return new Map(fields.map((field) => [field.name, field]));
  }, [fields]);

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

  function validateForm() {
    for (const field of fields) {
      const rawValue = form[field.name];
      const value = Array.isArray(rawValue) ? rawValue : String(rawValue ?? "").trim();

      if (field.required) {
        if (Array.isArray(value) && value.length === 0) {
          return `Preencha o campo ${field.label}.`;
        }

        if (!Array.isArray(value) && value === "") {
          return `Preencha o campo ${field.label}.`;
        }
      }

      if (field.minLength && !Array.isArray(value) && value !== "" && value.length < field.minLength) {
        return `${field.label} precisa ter pelo menos ${field.minLength} caracteres.`;
      }

      if (field.type === "email" && !Array.isArray(value) && value !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
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

  function normalizeOption(option: FieldOption) {
    return typeof option === "string" ? { value: option, label: option } : option;
  }

  function normalizeMultiselectValue(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (entry && typeof entry === "object" && "id" in (entry as Record<string, unknown>)) {
          return String((entry as Record<string, unknown>).id ?? "");
        }

        return String(entry ?? "");
      })
      .filter((entry) => entry !== "");
  }

  function normalizeTagValue(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => String(entry ?? "").trim())
      .filter((entry, index, list) => entry !== "" && list.indexOf(entry) === index);
  }

  function formFromItem(item: Record<string, unknown>) {
    return fields.reduce<Record<string, FieldValue>>((acc, field) => {
      if (field.type === "password") {
        acc[field.name] = "";
        return acc;
      }

      const value = valueFromPath(item, field.source ?? field.name) ?? valueFromPath(item, field.name);

      if (field.type === "multiselect") {
        acc[field.name] = normalizeMultiselectValue(value);
        return acc;
      }

      if (field.type === "tags") {
        acc[field.name] = normalizeTagValue(value);
        return acc;
      }

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
        const field = fields.find((entry) => entry.name === key);

        if (field?.noSubmit) {
          return false;
        }

        if (Array.isArray(value)) {
          return value.length > 0;
        }

        return value !== "";
      })
    );

    try {
      await apiJson(editingId ? `${endpoint}/${editingId}` : endpoint, {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      setForm(initialValues);
      setTagDrafts({});
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

  function updateField(name: string, nextValue: FieldValue) {
    setForm((current) => ({ ...current, [name]: nextValue }));
  }

  function toggleMultiselectValue(fieldName: string, optionValue: string) {
    const currentValues = Array.isArray(form[fieldName]) ? form[fieldName] : [];
    const nextValues = currentValues.includes(optionValue)
      ? currentValues.filter((entry) => entry !== optionValue)
      : [...currentValues, optionValue];

    updateField(fieldName, nextValues);
  }

  function addTagValue(fieldName: string) {
    const draft = String(tagDrafts[fieldName] ?? "").trim();

    if (draft.length < 2) {
      return;
    }

    const currentValues = Array.isArray(form[fieldName]) ? form[fieldName] : [];
    const alreadyExists = currentValues.some((entry) => entry.toLowerCase() === draft.toLowerCase());

    if (!alreadyExists) {
      updateField(fieldName, [...currentValues, draft]);
    }

    setTagDrafts((current) => ({
      ...current,
      [fieldName]: ""
    }));
  }

  function removeTagValue(fieldName: string, tagValue: string) {
    const currentValues = Array.isArray(form[fieldName]) ? form[fieldName] : [];
    updateField(
      fieldName,
      currentValues.filter((entry) => entry !== tagValue)
    );
  }

  function renderField(field: Field) {
    const wrapperClass = field.fullWidth ? "sm:col-span-2" : "";
    const labelClass = `block ${wrapperClass}`.trim();
    const selectOptions = (field.options ?? []).map(normalizeOption);
    const filterValue = searchFilters[field.name] ?? "";
    const filteredOptions = field.searchable && filterValue
      ? selectOptions.filter((option) => option.label.toLowerCase().includes(filterValue.toLowerCase()))
      : selectOptions;

    return (
      <label key={field.name} className={labelClass}>
        <span className="field-label">{field.label}</span>

        {field.searchable ? (
          <input
            className="input-control mb-3"
            type="search"
            placeholder={`Buscar ${field.label.toLowerCase()}`}
            value={filterValue}
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
            value={Array.isArray(form[field.name]) ? "" : String(form[field.name] ?? "")}
            onChange={(event) => updateField(field.name, event.target.value)}
          >
            <option value="">{field.placeholder ?? "-"}</option>
            {filteredOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : null}

        {field.type === "multiselect" ? (
          <div className="rounded-2xl border border-line bg-white p-3">
            <div className="mb-3 flex flex-wrap gap-2">
              {Array.isArray(form[field.name]) && form[field.name].length > 0 ? (
                (form[field.name] as string[]).map((selectedValue: string) => {
                  const option = selectOptions.find((entry) => entry.value === selectedValue);
                  return (
                    <button
                      key={selectedValue}
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-line bg-field px-3 py-2 text-xs font-black text-graphite"
                      onClick={() => toggleMultiselectValue(field.name, selectedValue)}
                    >
                      {option?.label ?? selectedValue}
                      <X className="h-3 w-3" />
                    </button>
                  );
                })
              ) : (
                <span className="text-sm font-semibold text-stone-500">Nenhuma opcao selecionada.</span>
              )}
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {filteredOptions.map((option) => {
                const selected = Array.isArray(form[field.name]) && form[field.name].includes(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm font-bold transition ${
                      selected ? "border-moss bg-emerald-50 text-forest" : "border-line bg-white text-ink hover:bg-muted"
                    }`}
                    onClick={() => toggleMultiselectValue(field.name, option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}

              {filteredOptions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line bg-muted/40 px-3 py-4 text-center text-sm font-semibold text-stone-500">
                  Nenhuma opcao encontrada.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {field.type === "tags" ? (
          <div className="rounded-2xl border border-line bg-white p-3">
            <div className="mb-3 flex flex-wrap gap-2">
              {Array.isArray(form[field.name]) && form[field.name].length > 0 ? (
                (form[field.name] as string[]).map((selectedValue: string) => (
                  <button
                    key={selectedValue}
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-line bg-field px-3 py-2 text-xs font-black text-graphite"
                    onClick={() => removeTagValue(field.name, selectedValue)}
                  >
                    {selectedValue}
                    <X className="h-3 w-3" />
                  </button>
                ))
              ) : (
                <span className="text-sm font-semibold text-stone-500">Nenhuma atividade nova adicionada.</span>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="input-control"
                type="text"
                placeholder={field.placeholder ?? "Digite a atividade e confirme"}
                value={tagDrafts[field.name] ?? ""}
                onChange={(event) =>
                  setTagDrafts((current) => ({
                    ...current,
                    [field.name]: event.target.value
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addTagValue(field.name);
                  }
                }}
              />
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-field px-4 text-sm font-black text-forest transition hover:bg-muted"
                onClick={() => addTagValue(field.name)}
              >
                Adicionar
              </button>
            </div>
          </div>
        ) : null}

        {!field.type || field.type === "text" || field.type === "email" || field.type === "password" || field.type === "search" ? (
          <input
            className="input-control"
            type={field.type ?? "text"}
            placeholder={field.placeholder}
            readOnly={field.readOnly}
            value={Array.isArray(form[field.name]) ? "" : String(form[field.name] ?? "")}
            onChange={(event) => updateField(field.name, event.target.value)}
          />
        ) : null}

        {field.description ? (
          <p className="mt-2 text-sm text-stone-500">{field.description}</p>
        ) : null}
      </label>
    );
  }

  return (
    <section>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={(
          <button
            type="button"
            title="Atualizar"
            onClick={() => void load()}
            className="secondary-button"
          >
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </button>
        )}
      />

      {message ? <div className="notice notice-warning">{message}</div> : null}

      <div className={`grid gap-4 ${formMode === "drawer" ? "2xl:grid-cols-[minmax(0,1fr)_400px]" : "2xl:grid-cols-[minmax(0,1fr)_340px]"}`}>
        <div className="table-wrap">
          <div className="border-b border-line/80 bg-white/90 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-sm font-black uppercase tracking-[0.12em] text-slateText">Busca guiada</h2>
                <p className="text-sm font-semibold text-slateText">
                  {searchHint ?? "Use a busca para localizar rapidamente o registro antes de alterar ou excluir."}
                </p>
              </div>
              <span className="rounded-full border border-line bg-field px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-graphite">
                {filteredItems.length} registro(s)
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  className="input-control h-12 pl-11 pr-24"
                  type="search"
                  placeholder={resolvedSearchPlaceholder}
                  value={tableSearch}
                  onChange={(event) => setTableSearch(event.target.value)}
                />
                {tableSearch ? (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-[0.12em] text-forest"
                    onClick={() => setTableSearch("")}
                  >
                    Limpar
                  </button>
                ) : null}
              </label>
              <div className="flex items-center justify-center rounded-2xl border border-line bg-field px-4 py-3 text-sm font-semibold text-slateText">
                Exibindo <span className="ml-1 font-black text-ink">{filteredItems.length}</span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.label} className={column.headerClassName ?? ""}>{column.label}</th>
                  ))}
                  <th className="w-56 px-4 py-3">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={String(item.id)} className="align-top">
                    {columns.map((column) => (
                      <td key={column.label} className={column.className ?? ""}>{column.value(item)}</td>
                    ))}
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          title="Alterar"
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-xs font-black uppercase tracking-[0.08em] text-graphite shadow-sm transition hover:-translate-y-0.5 hover:bg-muted"
                          onClick={() => {
                            setEditingId(String(item.id));
                            setForm(formFromItem(item));
                            setTagDrafts({});
                          }}
                        >
                          <Edit3 className="h-4 w-4" />
                          <span className="hidden sm:inline">Alterar</span>
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
                          <span className="hidden sm:inline">Excluir</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-stone-500" colSpan={columns.length + 1}>
                      {loading ? "Carregando..." : tableSearch ? "Nenhum registro encontrado para a busca." : "Nenhum registro encontrado."}
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
              <div className="mb-2">
                <span className={`${editingId ? "execution-chip" : "brand-chip"}`}>
                  {editingId ? "Alteracao em andamento" : "Novo cadastro"}
                </span>
              </div>
              <h2 className="panel-title">{resolvedFormTitle}</h2>
              <p className="panel-subtitle">
                {formSubtitle ?? (title === "Clientes" ? "Cadastro completo para roteiro e atendimento em campo." : "Preencha os dados e confirme a gravacao do registro.")}
              </p>
            </div>
            {editingId ? (
              <button
                type="button"
                title="Cancelar"
                className="icon-button"
                onClick={() => {
                  setEditingId(null);
                  setForm(initialValues);
                  setTagDrafts({});
                }}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="space-y-5 p-6">
            {sections.map((section) => (
              <div key={section.title} className="rounded-[1.35rem] border border-line bg-white p-4 shadow-sm shadow-slate-900/5">
                <div className="mb-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.12em] text-ink">{section.title}</h3>
                  {section.description ? (
                    <p className="mt-1 text-sm font-semibold leading-6 text-slateText">{section.description}</p>
                  ) : null}
                </div>
                <div className={`grid gap-5 ${section.columns === 1 ? "grid-cols-1" : "sm:grid-cols-2"}`}>
                  {section.fields.map((fieldName) => {
                    const field = fieldMap.get(fieldName);
                    return field ? renderField(field) : null;
                  })}
                </div>
              </div>
            ))}

            <button type="submit" title={actionLabel} disabled={loading} className="primary-button w-full">
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

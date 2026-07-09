import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, Edit3, Plus, RefreshCcw, Search, Trash2, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { apiJson } from "../lib/api";
import { formatPhone } from "../lib/phone";

type FormValue = string | string[];

interface Field {
  name: string;
  label: string;
  source?: string;
  type?: "text" | "email" | "password" | "select" | "search" | "multiselect" | "tel";
  format?: "phone";
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

interface FieldSection {
  title: string;
  description?: string;
  fields: string[];
  columns?: 1 | 2;
}

interface CrudPageProps {
  title: string;
  endpoint: string;
  fields: Field[];
  columns: Array<{
    label: string;
    value: (item: Record<string, unknown>) => ReactNode;
    className?: string;
    headerClassName?: string;
  }>;
  initialValues: Record<string, FormValue>;
  searchMode?: "search-first" | "always";
  searchMinLength?: number;
  formMode?: "sidebar" | "drawer";
  createTitle?: string;
  editTitle?: string;
  formSubtitle?: string;
  createButtonLabel?: string;
  fieldSections?: FieldSection[];
}

export function CrudPage({
  title,
  endpoint,
  fields,
  columns,
  initialValues,
  searchMode = "search-first",
  searchMinLength = 2,
  formMode = "sidebar",
  createTitle,
  editTitle,
  formSubtitle,
  createButtonLabel,
  fieldSections
}: CrudPageProps) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState(initialValues);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [searchRequested, setSearchRequested] = useState(searchMode !== "search-first");
  const [searchFilters, setSearchFilters] = useState<Record<string, string>>({});
  const [isFormOpen, setIsFormOpen] = useState(formMode === "sidebar");

  const actionLabel = useMemo(() => (editingId ? "Alterar" : "Incluir"), [editingId]);
  const requiresSearch = searchMode === "search-first";
  const hasActiveSearch = !requiresSearch || searchRequested;
  const searchPlaceholder = title === "Clientes"
    ? "Buscar cliente por codigo, nome, documento, representante, endereco, bairro, cidade, empresa, promotor ou atividade"
    : `Buscar em ${title.toLowerCase()}`;
  const resolvedCreateTitle = createTitle ?? (title === "Clientes" ? "Incluir cliente" : "Incluir registro");
  const resolvedEditTitle = editTitle ?? (title === "Clientes" ? "Alterar ficha do cliente" : "Alterar registro");
  const resolvedFormSubtitle = formSubtitle ?? (title === "Clientes"
    ? "Cadastro completo para roteiro e atendimento em campo."
    : undefined);
  const resolvedCreateButtonLabel = createButtonLabel ?? (title === "Clientes" ? "Novo cliente" : `Novo ${title.slice(0, -1).toLowerCase()}`);
  const formTitle = editingId ? resolvedEditTitle : resolvedCreateTitle;
  const searchHint = requiresSearch
    ? `Digite pelo menos ${searchMinLength} caracteres ou clique em Buscar vazio para listar todos.`
    : "Busca vazia lista todos os registros deste cadastro.";

  const resolvedFieldSections = useMemo(() => {
    if (!fieldSections || fieldSections.length === 0) {
      return [{
        title: "Dados do cadastro",
        fields: fields.map((field) => field.name),
        columns: 2 as const
      }];
    }

    const configuredFieldNames = new Set(fieldSections.flatMap((section) => section.fields));
    const remainingFields = fields
      .filter((field) => !configuredFieldNames.has(field.name))
      .map((field) => field.name);

    if (remainingFields.length === 0) {
      return fieldSections;
    }

    return [
      ...fieldSections,
      {
        title: "Outros dados",
        fields: remainingFields,
        columns: 2 as const
      }
    ];
  }, [fieldSections, fields]);

  useEffect(() => {
    if (formMode === "sidebar") {
      setIsFormOpen(true);
    }
  }, [formMode]);

  async function load(searchValue = submittedSearch, allowBlankSearch = false) {
    const normalizedSearch = searchValue.trim();

    if (requiresSearch && normalizedSearch.length === 0 && !allowBlankSearch) {
      setItems([]);
      setLoading(false);
      return;
    }

    if (requiresSearch && normalizedSearch.length > 0 && normalizedSearch.length < searchMinLength) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const params = new URLSearchParams();

      if (normalizedSearch) {
        params.set("q", normalizedSearch);
      }

      const response = await apiJson<{ data: Array<Record<string, unknown>> }>(
        params.size > 0 ? `${endpoint}?${params.toString()}` : endpoint
      );
      setItems(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (requiresSearch) {
      setItems([]);
      setSearchRequested(false);
      return;
    }

    void load("");
  }, [endpoint, requiresSearch]);

  function softDeleteMode(item: Record<string, unknown>) {
    return typeof item.status === "string";
  }

  function removeActionLabel(item: Record<string, unknown>) {
    return softDeleteMode(item) ? "Inativar" : "Excluir";
  }

  function removeSuccessMessage(item: Record<string, unknown>) {
    return softDeleteMode(item) ? "Registro inativado com sucesso." : "Registro removido com sucesso.";
  }

  function removeConfirmMessage(item: Record<string, unknown>) {
    return softDeleteMode(item)
      ? "Deseja inativar este registro? Ele deixara de ficar ativo nos cadastros, mas continuara preservado no historico."
      : "Deseja excluir este registro?";
  }

  function validateForm() {
    for (const field of fields) {
      const rawValue = form[field.name];
      const value = Array.isArray(rawValue) ? rawValue : rawValue?.trim() ?? "";

      if (field.required && (Array.isArray(value) ? value.length === 0 : value === "")) {
        return `Preencha o campo ${field.label}.`;
      }

      if (!Array.isArray(value) && field.minLength && value !== "" && value.length < field.minLength) {
        return `${field.label} precisa ter pelo menos ${field.minLength} caracteres.`;
      }

      if (!Array.isArray(value) && field.type === "email" && value !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
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
    return fields.reduce<Record<string, FormValue>>((acc, field) => {
      if (field.type === "password") {
        acc[field.name] = "";
        return acc;
      }

      const value = valueFromPath(item, field.source ?? field.name) ?? valueFromPath(item, field.name);
      if (field.type === "multiselect") {
        acc[field.name] = Array.isArray(value)
          ? value
              .map((entry) => {
                if (entry && typeof entry === "object") {
                  return String((entry as Record<string, unknown>).id ?? "");
                }

                return String(entry ?? "");
              })
              .filter(Boolean)
          : [];
        return acc;
      }

      acc[field.name] = value == null ? "" : String(value);
      return acc;
    }, { ...initialValues });
  }

  function resetForm() {
    setEditingId(null);
    setForm(initialValues);
    setSearchFilters({});
  }

  function closeForm() {
    resetForm();
    if (formMode === "drawer") {
      setIsFormOpen(false);
    }
  }

  function openCreateForm() {
    resetForm();
    setMessage(null);
    setIsFormOpen(true);
  }

  function openEditForm(item: Record<string, unknown>) {
    setEditingId(String(item.id));
    setForm(formFromItem(item));
    setSearchFilters({});
    setMessage(null);
    setIsFormOpen(true);
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
          return field?.type === "multiselect" || value.length > 0;
        }

        return value !== "";
      })
    );

    try {
      await apiJson(editingId ? `${endpoint}/${editingId}` : endpoint, {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      resetForm();
      if (formMode === "drawer") {
        setIsFormOpen(false);
      }
      await load(submittedSearch);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operacao nao concluida.");
    } finally {
      setLoading(false);
    }
  }

  async function remove(item: Record<string, unknown>) {
    setLoading(true);
    setMessage(null);

    try {
      await apiJson(`${endpoint}/${String(item.id)}`, { method: "DELETE" });
      setMessage(removeSuccessMessage(item));
      await load(submittedSearch);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel remover.");
    } finally {
      setLoading(false);
    }
  }

  function renderField(field: Field) {
    const wrapperClass = field.fullWidth ? "sm:col-span-2" : "";
    const labelClass = `block ${wrapperClass}`.trim();
    const selectOptions = field.options ?? [];
    const fieldValue = form[field.name];
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
            value={String(form[field.name] ?? "")}
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
        ) : field.type === "multiselect" ? (
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-line bg-white p-2">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm font-semibold text-stone-500">Nenhuma opcao encontrada.</div>
            ) : null}
            {filteredOptions.map((option) => {
              const value = typeof option === "string" ? option : option.value;
              const label = typeof option === "string" ? option : option.label;
              const currentValues = Array.isArray(form[field.name]) ? form[field.name] as string[] : [];
              const checked = currentValues.includes(value);

              return (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-bold transition ${
                    checked ? "border-brand bg-blue-50 text-brand" : "border-transparent bg-field/50 text-ink hover:bg-field"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-600"
                    checked={checked}
                    onChange={(event) => {
                      setForm((current) => {
                        const selected = Array.isArray(current[field.name]) ? current[field.name] as string[] : [];
                        return {
                          ...current,
                          [field.name]: event.target.checked
                            ? Array.from(new Set([...selected, value]))
                            : selected.filter((item) => item !== value)
                        };
                      });
                    }}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <input
            className="input-control"
            type={field.type ?? "text"}
            placeholder={field.placeholder}
            readOnly={field.readOnly}
            inputMode={field.type === "tel" ? "numeric" : undefined}
            autoComplete={field.type === "tel" ? "tel" : undefined}
            value={field.format === "phone" ? formatPhone(fieldValue) : String(fieldValue ?? "")}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                [field.name]: field.format === "phone" ? formatPhone(event.target.value) : event.target.value
              }))
            }
          />
        )}
        {field.description ? (
          <p className="mt-2 text-sm text-stone-500">{field.description}</p>
        ) : null}
      </label>
    );
  }

  function renderFormContents() {
    return (
      <div className="space-y-5">
        {resolvedFieldSections.map((section) => {
          const sectionFields = section.fields
            .map((fieldName) => fields.find((field) => field.name === fieldName))
            .filter((field): field is Field => Boolean(field));
          const columnsClass = section.columns === 1 ? "grid-cols-1" : "sm:grid-cols-2";
          const showSectionHeader =
            Boolean(section.description) ||
            resolvedFieldSections.length > 1 ||
            section.title !== "Dados do cadastro";

          if (sectionFields.length === 0) {
            return null;
          }

          return (
            <section key={section.title} className="rounded-[1.35rem] border border-line/80 bg-white p-4 shadow-sm sm:p-5">
              {showSectionHeader ? (
                <div className="mb-4">
                  <h3 className="text-base font-black tracking-tight text-ink">{section.title}</h3>
                  {section.description ? (
                    <p className="mt-1 text-sm leading-6 text-slateText">{section.description}</p>
                  ) : null}
                </div>
              ) : null}
              <div className={`grid gap-5 ${columnsClass}`}>
                {sectionFields.map((field) => renderField(field))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  const formElement = (
    <form onSubmit={onSubmit} className={formMode === "drawer" ? "flex h-full flex-col" : "panel overflow-hidden xl:sticky xl:top-20 xl:self-start"}>
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{formTitle}</h2>
          {resolvedFormSubtitle ? (
            <p className="panel-subtitle">{resolvedFormSubtitle}</p>
          ) : null}
        </div>
        {(editingId || formMode === "drawer") ? (
          <button
            type="button"
            title="Fechar"
            className="icon-button"
            onClick={closeForm}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className={formMode === "drawer" ? "flex-1 overflow-y-auto p-5 sm:p-6" : "p-6"}>
        {message && formMode === "drawer" ? <div className="notice notice-warning">{message}</div> : null}

        {renderFormContents()}

        <div className={`mt-5 flex gap-3 ${formMode === "drawer" ? "flex-col-reverse sm:flex-row sm:justify-end" : "flex-col"}`}>
          {formMode === "drawer" ? (
            <button type="button" className="secondary-button w-full sm:w-auto" onClick={closeForm}>
              Cancelar
            </button>
          ) : null}
          <button type="submit" title={actionLabel} disabled={loading} className={`primary-button ${formMode === "drawer" ? "w-full sm:w-auto" : "w-full"}`}>
            {editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingId ? "Salvar alteracao" : actionLabel}
          </button>
        </div>
      </div>
    </form>
  );

  return (
    <section>
      <PageHeader
        title={title}
        action={
          <>
            {formMode === "drawer" ? (
              <button
                type="button"
                title={resolvedCreateButtonLabel}
                onClick={openCreateForm}
                className="primary-button"
              >
                <Plus className="h-4 w-4" />
                {resolvedCreateButtonLabel}
              </button>
            ) : null}
            <button
              type="button"
              title="Atualizar"
              onClick={() => {
                const nextSearch = tableSearch.trim() || submittedSearch;
                const allowBlankSearch = requiresSearch && nextSearch.length === 0;

                if (allowBlankSearch) {
                  setSubmittedSearch("");
                  setSearchRequested(true);
                }

                void load(nextSearch, allowBlankSearch || searchRequested);
              }}
              className="secondary-button"
            >
              <RefreshCcw className="h-4 w-4" />
              Atualizar
            </button>
          </>
        }
      />

      {message && !(formMode === "drawer" && isFormOpen) ? <div className="notice notice-warning">{message}</div> : null}

      <div className={formMode === "drawer" ? "space-y-4" : "grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]"}>
        <div className="table-wrap">
          <div className="border-b border-line/80 bg-gradient-to-r from-white to-skywash/60 p-4">
            <form
              className="flex flex-col gap-3 lg:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                const nextSearch = tableSearch.trim();

                if (requiresSearch && nextSearch.length > 0 && nextSearch.length < searchMinLength) {
                  setItems([]);
                  setSubmittedSearch("");
                  setSearchRequested(false);
                  setMessage(`Digite pelo menos ${searchMinLength} caracteres para pesquisar em ${title.toLowerCase()}.`);
                  return;
                }

                setSubmittedSearch(nextSearch);
                setSearchRequested(true);
                void load(nextSearch, nextSearch.length === 0);
              }}
            >
              <label className="relative block flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  className="input-control h-12 pl-11 pr-24"
                  type="search"
                  placeholder={searchPlaceholder}
                  value={tableSearch}
                  onChange={(event) => setTableSearch(event.target.value)}
                />
                {tableSearch ? (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-[0.12em] text-forest"
                    onClick={() => {
                      setTableSearch("");
                      setSubmittedSearch("");
                      setSearchRequested(false);
                      setItems([]);
                      setMessage(null);
                    }}
                  >
                    Limpar
                  </button>
                ) : null}
              </label>

              <button type="submit" className="secondary-button h-12 min-w-[132px]">
                <Search className="h-4 w-4" />
                Buscar
              </button>
            </form>
            <div className="mt-3 text-xs font-semibold text-stone-500">
              {hasActiveSearch
                ? submittedSearch
                  ? `Exibindo ${items.length} registro(s) encontrados.`
                  : `Exibindo ${items.length} registro(s).`
                : searchHint}
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
                {items.map((item) => (
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
                          onClick={() => openEditForm(item)}
                        >
                          <Edit3 className="h-4 w-4" />
                          <span className="hidden sm:inline">Alterar</span>
                        </button>
                        <button
                          type="button"
                          title={removeActionLabel(item)}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-xs font-black uppercase tracking-[0.08em] text-berry shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-50"
                          onClick={() => {
                            if (window.confirm(removeConfirmMessage(item))) {
                              void remove(item);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="hidden sm:inline">{removeActionLabel(item)}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-stone-500" colSpan={columns.length + 1}>
                      {loading
                        ? "Pesquisando..."
                        : !hasActiveSearch
                          ? searchHint
                          : submittedSearch
                            ? "Nenhum registro encontrado para a busca."
                            : "Nenhum registro encontrado."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {formMode === "sidebar" ? formElement : null}
      </div>

      {formMode === "drawer" && isFormOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 p-3 backdrop-blur-[2px] sm:p-5">
          <div className="panel flex h-full w-full max-w-[1040px] overflow-hidden shadow-[0_28px_90px_rgba(15,23,42,0.28)]">
            {formElement}
          </div>
        </div>
      ) : null}
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

import { useEffect, useState } from "react";
import { StatusPill } from "../components/StatusPill";
import { useAuth } from "../context/AuthContext";
import { apiJson } from "../lib/api";
import { companyLabel, toCompanyOptions, type CompanyOption } from "../lib/company-options";
import { CrudPage } from "./CrudPage";

function textValue(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : fallback;
}

export function SuppliersPage() {
  const { user } = useAuth();
  const [companyOptions, setCompanyOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ value: string; label: string }>>([]);
  const canLoadCompanies = user?.role === "ADMIN";
  const shouldShowCompanySelect = user?.role === "ADMIN";
  const companyDisplay = user?.company
    ? companyLabel(user.company)
    : user?.companyId
      ? "Empresa vinculada automaticamente ao seu acesso"
      : "";

  useEffect(() => {
    if (!canLoadCompanies) {
      return;
    }

    void (async () => {
      try {
        const categoriesResponse = await apiJson<{ data: Array<Record<string, unknown>> }>("/product-categories");
        setCategoryOptions(
          categoriesResponse.data
            .filter((category) => category.status !== "INACTIVE")
            .map((category) => ({
              value: String(category.id ?? ""),
              label: `${textValue(category.name, "Categoria")} • ${companyLabel(category.company as CompanyOption | null | undefined)}`
            }))
            .filter((option) => option.value !== "")
        );

        if (canLoadCompanies) {
          const companiesResponse = await apiJson<{ data: CompanyOption[] }>("/companies");
          setCompanyOptions(toCompanyOptions(companiesResponse.data));
        }
      } catch {
        setCompanyOptions([]);
        setCategoryOptions([]);
      }
    })();
  }, [canLoadCompanies]);

  return (
    <CrudPage
      title="Fornecedores"
      endpoint="/suppliers"
      initialValues={{
        companyId: user?.companyId ?? "",
        companyDisplay,
        name: "",
        tradeName: "",
        document: "",
        contactName: "",
        phone: "",
        email: "",
        notes: "",
        categoryIds: [],
        status: "ACTIVE"
      }}
      fields={[
        ...(shouldShowCompanySelect
          ? [{
              name: "companyId",
              label: "Empresa/Filial",
              type: "select" as const,
              searchable: true,
              placeholder: "Selecione a empresa/filial",
              options: companyOptions,
              required: true,
              fullWidth: true
            }]
          : [{
              name: "companyDisplay",
              label: "Empresa/Filial",
              placeholder: "Empresa definida pelo usuario",
              readOnly: true,
              noSubmit: true,
              fullWidth: true
            }]),
        { name: "name", label: "Razao social / Nome", required: true, minLength: 2, fullWidth: true },
        { name: "tradeName", label: "Nome fantasia", fullWidth: true },
        { name: "document", label: "CNPJ/Documento" },
        { name: "contactName", label: "Contato" },
        { name: "phone", label: "Telefone" },
        { name: "email", label: "E-mail", type: "email" },
        {
          name: "categoryIds",
          source: "categories",
          label: "Categorias de produtos",
          type: "multiselect",
          searchable: true,
          options: categoryOptions,
          description: "Selecione uma ou mais categorias atendidas por este fornecedor.",
          fullWidth: true
        },
        { name: "notes", label: "Observacoes", fullWidth: true },
        {
          name: "status",
          label: "Situacao",
          type: "select",
          options: [
            { value: "ACTIVE", label: "Ativo" },
            { value: "INACTIVE", label: "Inativo" }
          ]
        }
      ]}
      columns={[
        {
          label: "Fornecedor",
          headerClassName: "w-[34%]",
          className: "min-w-[260px]",
          value: (item) => (
            <div className="space-y-1.5">
              <strong className="block text-base leading-tight text-ink">{textValue(item.name)}</strong>
              <div className="text-xs font-semibold text-stone-500">Fantasia: {textValue(item.tradeName, "Nao informado")}</div>
              <div className="text-xs font-semibold text-stone-500">Documento: {textValue(item.document, "Nao informado")}</div>
              <div className="text-xs font-semibold text-stone-500">Empresa: {companyLabel(item.company as CompanyOption | null | undefined)}</div>
            </div>
          )
        },
        {
          label: "Contato",
          headerClassName: "w-[28%]",
          className: "min-w-[220px]",
          value: (item) => (
            <div className="space-y-1">
              <strong className="block leading-snug text-ink">{textValue(item.contactName, "Sem contato")}</strong>
              <span className="block text-xs font-semibold text-stone-500">Telefone: {textValue(item.phone, "Nao informado")}</span>
              <span className="block text-xs font-semibold text-stone-500">E-mail: {textValue(item.email, "Nao informado")}</span>
            </div>
          )
        },
        {
          label: "Categorias",
          headerClassName: "w-[20%]",
          className: "min-w-[210px]",
          value: (item) => {
            const categories = Array.isArray(item.categories) ? item.categories as Array<Record<string, unknown>> : [];

            if (categories.length === 0) {
              return <span className="text-sm font-semibold text-stone-500">Nao vinculadas</span>;
            }

            return (
              <div className="flex flex-wrap gap-1.5">
                {categories.slice(0, 3).map((category) => (
                  <span key={String(category.id)} className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-brand">
                    {textValue(category.name)}
                  </span>
                ))}
                {categories.length > 3 ? (
                  <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-black text-slateText">+{categories.length - 3}</span>
                ) : null}
              </div>
            );
          }
        },
        {
          label: "Clientes",
          headerClassName: "w-[12%]",
          className: "min-w-[110px]",
          value: (item) => {
            const count = (item._count as { clients?: number } | undefined)?.clients ?? 0;
            return <span className="font-black text-ink">{count}</span>;
          }
        },
        {
          label: "Situacao",
          headerClassName: "w-[10%]",
          className: "min-w-[110px]",
          value: (item) => <StatusPill value={String(item.status ?? "")} />
        }
      ]}
    />
  );
}

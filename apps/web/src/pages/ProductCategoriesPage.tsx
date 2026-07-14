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

function categoryCode(value: unknown) {
  const code = Number(value);

  if (!Number.isFinite(code) || code <= 0) {
    return "Automatico";
  }

  return `CAT-${String(code).padStart(4, "0")}`;
}

export function ProductCategoriesPage() {
  const { user } = useAuth();
  const [companyOptions, setCompanyOptions] = useState<Array<{ value: string; label: string }>>([]);
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
        const response = await apiJson<{ data: CompanyOption[] }>("/companies");
        setCompanyOptions(toCompanyOptions(response.data));
      } catch {
        setCompanyOptions([]);
      }
    })();
  }, [canLoadCompanies]);

  return (
    <CrudPage
      title="Categorias de produtos"
      subtitle="Classificacao comercial usada para organizar fornecedores, sortimento e leitura operacional da base."
      endpoint="/product-categories"
      searchHint="Busque por codigo, categoria, descricao, empresa ou situacao."
      formMode="drawer"
      createTitle="Incluir categoria"
      editTitle="Alterar categoria"
      formSubtitle="Categorias usadas para organizar fornecedores e padronizar a leitura comercial."
      createButtonLabel="Nova categoria"
      searchPlaceholder="Buscar por codigo, categoria, descricao, empresa ou situacao"
      initialValues={{
        code: "",
        companyId: user?.companyId ?? "",
        companyDisplay,
        name: "",
        description: "",
        status: "ACTIVE"
      }}
      fieldSections={[
        {
          title: "Identificacao da categoria",
          description: "Empresa vinculada e dados principais da classificacao.",
          fields: shouldShowCompanySelect
            ? ["code", "companyId", "name", "status"]
            : ["code", "companyDisplay", "name", "status"]
        },
        {
          title: "Descricao operacional",
          description: "Uso interno para orientar a equipe comercial.",
          fields: ["description"],
          columns: 1
        }
      ]}
      fields={[
        {
          name: "code",
          label: "Codigo",
          placeholder: "Automatico",
          description: "Gerado automaticamente pelo sistema.",
          readOnly: true,
          noSubmit: true
        },
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
        { name: "name", label: "Categoria", required: true, minLength: 2, fullWidth: true },
        { name: "description", label: "Descricao", fullWidth: true },
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
          label: "Categoria",
          headerClassName: "w-[34%]",
          className: "min-w-[260px]",
          value: (item) => (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-forest">
                  {categoryCode(item.code)}
                </span>
                <strong className="text-base leading-tight text-ink">{textValue(item.name)}</strong>
              </div>
              <div className="text-xs font-semibold text-stone-500">{textValue(item.description, "Sem descricao")}</div>
            </div>
          )
        },
        {
          label: "Empresa/Filial",
          headerClassName: "w-[28%]",
          className: "min-w-[220px]",
          value: (item) => <strong className="block leading-snug text-ink">{companyLabel(item.company as CompanyOption | null | undefined)}</strong>
        },
        {
          label: "Uso",
          headerClassName: "w-[20%]",
          className: "min-w-[170px]",
          value: (item) => {
            const count = (item._count as { suppliers?: number } | undefined)?.suppliers ?? 0;

            return (
              <div className="space-y-2">
                <strong className="block text-base leading-tight text-ink">{count} fornecedor(es)</strong>
                <span className="block text-xs font-semibold text-stone-500">vinculados</span>
              </div>
            );
          }
        },
        {
          label: "Situacao",
          headerClassName: "w-[18%]",
          className: "min-w-[120px]",
          value: (item) => <StatusPill value={String(item.status ?? "")} />
        }
      ]}
    />
  );
}

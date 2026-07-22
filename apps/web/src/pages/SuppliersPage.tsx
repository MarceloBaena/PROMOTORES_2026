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
  const [activityOptions, setActivityOptions] = useState<Array<{ value: string; label: string }>>([]);
  const canLoadCompanies = user?.role === "ADMIN";
  const shouldShowCompanySelect = user?.role === "ADMIN";
  const companyDisplay = user?.company
    ? companyLabel(user.company)
    : user?.companyId
      ? "Empresa vinculada automaticamente ao seu acesso"
      : "";

  useEffect(() => {
    void (async () => {
      try {
        const categoriesResponse = await apiJson<{ data: Array<Record<string, unknown>> }>("/product-categories");
        const activitiesResponse = await apiJson<{ data: Array<Record<string, unknown>> }>("/client-activities");
        setCategoryOptions(
          categoriesResponse.data
            .filter((category) => category.status !== "INACTIVE")
            .map((category) => ({
              value: String(category.id ?? ""),
              label: `${textValue(category.name, "Categoria")} - ${companyLabel(category.company as CompanyOption | null | undefined)}`
            }))
            .filter((option) => option.value !== "")
        );
        setActivityOptions(
          activitiesResponse.data
            .filter((activity) => activity.status !== "INACTIVE")
            .map((activity) => ({
              value: String(activity.id ?? ""),
              label: `${textValue(activity.name, "Atividade")} - ${companyLabel(activity.company as CompanyOption | null | undefined)}`
            }))
            .filter((option) => option.value !== "")
        );

        if (canLoadCompanies) {
          const companiesResponse = await apiJson<{ data: CompanyOption[] }>("/companies");
          setCompanyOptions(toCompanyOptions(companiesResponse.data));
        } else {
          setCompanyOptions([]);
        }
      } catch {
        setCompanyOptions([]);
        setCategoryOptions([]);
        setActivityOptions([]);
      }
    })();
  }, [canLoadCompanies]);

  return (
    <CrudPage
      title="Fornecedores"
      subtitle="Cadastro das industrias e marcas atendidas pela operacao, concentrando categorias, contato comercial e atividades executadas em campo."
      endpoint="/suppliers"
      searchHint="Busque por fornecedor, fantasia, documento, telefone, empresa, categoria, atividade ou situacao."
      formPlacement="top"
      startFormCollapsed
      createTitle="Incluir fornecedor"
      editTitle="Alterar fornecedor"
      formSubtitle="Fornecedor ativo fica disponivel automaticamente para todos os clientes da empresa/filial, com atividades que orientam o trabalho do promotor no cliente."
      createButtonLabel="Novo fornecedor"
      searchPlaceholder="Buscar por nome, fantasia, documento, contato, categoria, atividade ou empresa"
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
        activityIds: [],
        activityNames: [],
        status: "ACTIVE"
      }}
      fieldSections={[
        {
          title: "Identificacao do fornecedor",
          description: "Empresa vinculada e dados principais do cadastro.",
          fields: shouldShowCompanySelect
            ? ["companyId", "name", "tradeName", "document", "status"]
            : ["companyDisplay", "name", "tradeName", "document", "status"]
        },
        {
          title: "Contato comercial",
          description: "Responsavel, telefone e e-mail para a equipe.",
          fields: ["contactName", "phone", "email"]
        },
        {
          title: "Cobertura e atividades",
          description: "Selecione atividades ja cadastradas ou crie novas atividades diretamente neste fornecedor.",
          fields: ["categoryIds", "activityIds", "activityNames", "notes"],
          columns: 1
        }
      ]}
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
        {
          name: "activityIds",
          source: "activities",
          label: "Atividades executadas neste fornecedor",
          type: "multiselect",
          searchable: true,
          options: activityOptions,
          description: "Importe ou selecione todas as atividades cadastradas que o promotor deve executar neste fornecedor.",
          fullWidth: true
        },
        {
          name: "activityNames",
          label: "Cadastrar novas atividades neste fornecedor",
          type: "tags",
          placeholder: "Ex.: Verificar ruptura, conferir exposicao, validar preco",
          description: "Digite a atividade e clique em Adicionar. O sistema cadastra a atividade e ja vincula ao fornecedor.",
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
          headerClassName: "w-[36%]",
          className: "min-w-[260px]",
          value: (item) => (
            <div className="space-y-1.5">
              <strong className="block text-base leading-tight text-ink">{textValue(item.name)}</strong>
              <div className="text-xs font-semibold text-stone-500">Fantasia: {textValue(item.tradeName, "Nao informado")}</div>
              <div className="text-xs font-semibold text-stone-500">Empresa: {companyLabel(item.company as CompanyOption | null | undefined)}</div>
              <div className="text-xs font-semibold text-stone-500">Documento: {textValue(item.document, "Nao informado")}</div>
            </div>
          )
        },
        {
          label: "Contato",
          headerClassName: "w-[24%]",
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
          label: "Escopo operacional",
          headerClassName: "w-[26%]",
          className: "min-w-[250px]",
          value: (item) => {
            const categories = Array.isArray(item.categories) ? item.categories as Array<Record<string, unknown>> : [];
            const activities = Array.isArray(item.activities) ? item.activities as Array<Record<string, unknown>> : [];

            return (
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-[11px] font-black uppercase tracking-[0.1em] text-slateText">Categorias</div>
                  {categories.length === 0 ? (
                    <span className="text-sm font-semibold text-stone-500">Nao vinculadas</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {categories.slice(0, 2).map((category) => (
                        <span key={String(category.id)} className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-brand">
                          {textValue(category.name)}
                        </span>
                      ))}
                      {categories.length > 2 ? (
                        <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-black text-slateText">+{categories.length - 2}</span>
                      ) : null}
                    </div>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-black uppercase tracking-[0.1em] text-slateText">Atividades</div>
                  {activities.length === 0 ? (
                    <span className="text-sm font-semibold text-stone-500">Nao vinculadas</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {activities.slice(0, 2).map((activity) => (
                        <span key={String(activity.id)} className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-forest">
                          {textValue(activity.name)}
                        </span>
                      ))}
                      {activities.length > 2 ? (
                        <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-black text-slateText">+{activities.length - 2}</span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            );
          }
        },
        {
          label: "Cobertura",
          headerClassName: "w-[14%]",
          className: "min-w-[180px]",
          value: (item) => {
            const count = (item._count as { clients?: number } | undefined)?.clients ?? 0;
            const activitiesCount = (item._count as { activities?: number } | undefined)?.activities ?? 0;

            return (
              <div className="space-y-2">
                <strong className="block text-base leading-tight text-ink">{count} cliente(s)</strong>
                <span className="block text-xs font-semibold text-stone-500">{activitiesCount} atividade(s)</span>
                <StatusPill value={String(item.status ?? "")} />
              </div>
            );
          }
        }
      ]}
    />
  );
}

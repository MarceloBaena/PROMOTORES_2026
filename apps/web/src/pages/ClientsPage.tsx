import { useEffect, useState } from "react";
import { StatusPill } from "../components/StatusPill";
import { useAuth } from "../context/AuthContext";
import { apiJson } from "../lib/api";
import { companyLabel, toCompanyOptions, type CompanyOption } from "../lib/company-options";
import { CrudPage } from "./CrudPage";

function promoterLabel(promoter: unknown) {
  const profile = promoter as { code?: number; user?: { name?: string } } | null | undefined;

  if (!profile) {
    return "-";
  }

  const code = Number(profile.code);
  const formattedCode = Number.isFinite(code) && code > 0 ? `PRO-${String(code).padStart(4, "0")}` : "PRO";
  return `${formattedCode} - ${profile.user?.name ?? "Sem nome"}`;
}

function textValue(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : fallback;
}

function activityLabel(activity: Record<string, unknown>) {
  return textValue(activity.name, "Atividade");
}

export function ClientsPage() {
  const { user } = useAuth();
  const [promoterOptions, setPromoterOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [companyOptions, setCompanyOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [activityOptions, setActivityOptions] = useState<Array<{ value: string; label: string }>>([]);
  const isPlatformAdmin = user?.role === "ADMIN" && !user.companyId;

  useEffect(() => {
    void (async () => {
      try {
        const [promotersResponse, activitiesResponse] = await Promise.all([
          apiJson<{ data: Array<Record<string, unknown>> }>("/promoters"),
          apiJson<{ data: Array<Record<string, unknown>> }>("/client-activities")
        ]);

        setPromoterOptions(
          promotersResponse.data
            .map((promoter) => ({
              value: String(promoter.id ?? ""),
              label: promoterLabel(promoter)
            }))
            .filter((option) => option.value !== "")
        );

        setActivityOptions(
          activitiesResponse.data
            .filter((activity) => activity.status !== "INACTIVE")
            .map((activity) => ({
              value: String(activity.id ?? ""),
              label: activityLabel(activity)
            }))
            .filter((option) => option.value !== "")
        );

        if (isPlatformAdmin) {
          const companiesResponse = await apiJson<{ data: CompanyOption[] }>("/companies");
          setCompanyOptions(toCompanyOptions(companiesResponse.data));
        }
      } catch {
        setPromoterOptions([]);
        setCompanyOptions([]);
        setActivityOptions([]);
      }
    })();
  }, [isPlatformAdmin]);

  return (
    <CrudPage
      title="Clientes"
      endpoint="/clients"
      formMode="drawer"
      createTitle="Incluir cliente"
      editTitle="Alterar ficha do cliente"
      formSubtitle="Cadastro do cliente para roteiros e atendimento em campo. Todos os fornecedores ativos da empresa/filial sao vinculados automaticamente."
      createButtonLabel="Novo cliente"
      searchPlaceholder="Buscar por codigo, nome, documento, representante, endereco, cidade, empresa, promotor ou atividade"
      fieldSections={[
        {
          title: "Identificacao do cliente",
          description: "Dados principais do cliente na operacao.",
          fields: ["code", "name", "document", "status"]
        },
        {
          title: "Empresa e responsavel",
          description: "Empresa, promotor padrao e representante comercial.",
          fields: isPlatformAdmin ? ["companyId", "defaultPromoterId", "representative"] : ["defaultPromoterId", "representative"],
          columns: 1
        },
        {
          title: "Endereco comercial",
          description: "Usado em roteiro, visita e mapa.",
          fields: ["address", "addressNumber", "district", "city", "state"]
        },
        {
          title: "Atividades previstas no cliente",
          description: "Atividades liberadas para a equipe em campo.",
          fields: ["activityIds"],
          columns: 1
        },
        {
          title: "Geolocalizacao",
          description: "Preencha apenas se o cliente ja tiver coordenadas.",
          fields: ["latitude", "longitude"]
        }
      ]}
      initialValues={{
        code: "",
        companyId: user?.companyId ?? "",
        name: "",
        document: "",
        representative: "",
        defaultPromoterId: "",
        address: "",
        addressNumber: "",
        district: "",
        city: "",
        state: "",
        latitude: "",
        longitude: "",
        activityIds: [],
        status: "ACTIVE"
      }}
      fields={[
        {
          name: "code",
          label: "Codigo",
          placeholder: "Automatico",
          description: "Gerado automaticamente pelo sistema em sequencia numerica.",
          readOnly: true,
          noSubmit: true
        },
        ...(isPlatformAdmin
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
          : []),
        { name: "name", label: "Nome", required: true, fullWidth: true },
        { name: "document", label: "Documento" },
        {
          name: "representative",
          label: "Representante",
          placeholder: "Nome do vendedor responsavel pelo cliente",
          fullWidth: true
        },
        {
          name: "defaultPromoterId",
          label: "Promotor responsavel",
          type: "select",
          searchable: true,
          placeholder: "Selecione o promotor",
          options: promoterOptions,
          fullWidth: true
        },
        {
          name: "activityIds",
          source: "activities",
          label: "Atividades deste cliente",
          type: "multiselect",
          searchable: true,
          options: activityOptions,
          fullWidth: true
        },
        { name: "address", label: "Endereco", fullWidth: true },
        { name: "addressNumber", label: "Numero" },
        { name: "district", label: "Bairro" },
        { name: "city", label: "Cidade" },
        { name: "state", label: "UF" },
        { name: "latitude", label: "Latitude" },
        { name: "longitude", label: "Longitude" },
        {
          name: "status",
          label: "Situacao",
          type: "select",
          options: [
            { value: "ACTIVE", label: "Ativo" },
            { value: "INACTIVE", label: "Inativo" },
            { value: "ARCHIVED", label: "Arquivado" }
          ]
        }
      ]}
      columns={[
        {
          label: "Cliente",
          headerClassName: "w-[26%]",
          className: "min-w-[260px]",
          value: (item) => (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-forest">
                  {textValue(item.code, "Sem codigo")}
                </span>
                <strong className="text-base leading-tight text-ink">{textValue(item.name)}</strong>
              </div>
              <div className="text-xs font-semibold text-stone-500">Documento: {textValue(item.document, "Sem documento")}</div>
            </div>
          )
        },
        {
          label: "Operacao",
          headerClassName: "w-[24%]",
          className: "min-w-[220px]",
          value: (item) => (
            <div className="space-y-1">
              <strong className="block leading-snug text-ink">{companyLabel(item.company as CompanyOption | null | undefined)}</strong>
              <span className="block text-xs font-semibold text-stone-500">Representante: {textValue(item.representative, "Nao informado")}</span>
              <span className="block text-xs font-semibold text-stone-500">Promotor: {promoterLabel(item.defaultPromoter)}</span>
            </div>
          )
        },
        {
          label: "Endereco",
          headerClassName: "w-[24%]",
          className: "min-w-[240px]",
          value: (item) => {
            const street = textValue(item.address, "Sem endereco");
            const number = item.addressNumber ? `, ${String(item.addressNumber)}` : "";
            const district = item.district ? String(item.district) : "Sem bairro";

            return (
              <div className="space-y-1">
                <strong className="block leading-snug text-ink">{street}{number}</strong>
                <span className="block text-xs font-semibold text-stone-500">Bairro: {district}</span>
                <span className="block text-xs font-semibold text-stone-500">{textValue(item.city)}/{textValue(item.state)}</span>
              </div>
            );
          }
        },
        {
          label: "Atendimento",
          headerClassName: "w-[26%]",
          className: "min-w-[240px]",
          value: (item) => {
            const activities = Array.isArray(item.activities) ? item.activities as Array<Record<string, unknown>> : [];
            const suppliers = Array.isArray(item.suppliers) ? item.suppliers as Array<Record<string, unknown>> : [];

            return (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {activities.length === 0 ? (
                    <span className="text-sm font-semibold text-stone-500">Sem atividades vinculadas</span>
                  ) : (
                    activities.slice(0, 2).map((activity) => (
                      <span key={String(activity.id)} className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-700">
                        {textValue(activity.name)}
                      </span>
                    ))
                  )}
                  {activities.length > 2 ? (
                    <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-black text-slateText">+{activities.length - 2}</span>
                  ) : null}
                </div>
                <span className="block text-xs font-semibold text-stone-500">Fornecedores ativos vinculados: {suppliers.length}</span>
              </div>
            );
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

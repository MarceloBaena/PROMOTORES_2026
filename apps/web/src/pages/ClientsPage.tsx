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

function supplierLabel(supplier: Record<string, unknown>) {
  const name = textValue(supplier.tradeName, textValue(supplier.name, "Fornecedor"));
  const document = textValue(supplier.document, "");
  return document ? `${name} - ${document}` : name;
}

function activityLabel(activity: Record<string, unknown>) {
  return textValue(activity.name, "Atividade");
}

export function ClientsPage() {
  const { user } = useAuth();
  const [promoterOptions, setPromoterOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [companyOptions, setCompanyOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [supplierOptions, setSupplierOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [activityOptions, setActivityOptions] = useState<Array<{ value: string; label: string }>>([]);
  const isPlatformAdmin = user?.role === "ADMIN" && !user.companyId;

  useEffect(() => {
    void (async () => {
      try {
        const [promotersResponse, suppliersResponse, activitiesResponse] = await Promise.all([
          apiJson<{ data: Array<Record<string, unknown>> }>("/promoters"),
          apiJson<{ data: Array<Record<string, unknown>> }>("/suppliers"),
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
        setSupplierOptions(
          suppliersResponse.data
            .filter((supplier) => supplier.status !== "INACTIVE")
            .map((supplier) => ({
              value: String(supplier.id ?? ""),
              label: supplierLabel(supplier)
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
        setSupplierOptions([]);
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
      formSubtitle="Preencha os dados em blocos separados para manter o cadastro claro e rapido."
      createButtonLabel="Novo cliente"
      fieldSections={[
        {
          title: "Identificacao do cliente",
          description: "Informacoes basicas para localizar e reconhecer o cliente no painel e no app.",
          fields: ["code", "name", "document", "status"]
        },
        {
          title: "Empresa e responsavel",
          description: "Defina a empresa/filial dona do cadastro, o promotor padrao e o representante comercial do cliente.",
          fields: isPlatformAdmin ? ["companyId", "defaultPromoterId", "representative"] : ["defaultPromoterId", "representative"],
          columns: 1
        },
        {
          title: "Endereco comercial",
          description: "Dados usados para roteiro, auditoria e localizacao no campo.",
          fields: ["address", "addressNumber", "district", "city", "state"]
        },
        {
          title: "Fornecedores vinculados",
          description: "Marque os fornecedores que abastecem este cliente para facilitar importacao e atendimento.",
          fields: ["supplierIds"],
          columns: 1
        },
        {
          title: "Atividades previstas no cliente",
          description: "Defina quais atividades operacionais podem ser executadas neste cliente pela equipe de campo.",
          fields: ["activityIds"],
          columns: 1
        },
        {
          title: "Geolocalizacao",
          description: "Preencha apenas quando quiser fixar a coordenada do cliente na base.",
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
        supplierIds: [],
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
        { name: "name", label: "Nome", fullWidth: true },
        { name: "document", label: "Documento" },
        {
          name: "representative",
          label: "Representante",
          placeholder: "Nome do vendedor responsavel pelo cliente",
          description: "Vendedor ou representante comercial que atende este cliente.",
          fullWidth: true
        },
        {
          name: "defaultPromoterId",
          label: "Promotor responsavel",
          type: "select",
          searchable: true,
          placeholder: "Selecione o promotor",
          options: promoterOptions,
          description: "Promotor padrao que atendera este cliente em campo.",
          fullWidth: true
        },
        {
          name: "supplierIds",
          source: "suppliers",
          label: "Fornecedores que este cliente compra",
          type: "multiselect",
          searchable: true,
          options: supplierOptions,
          description: "Selecione um ou mais fornecedores vinculados ao abastecimento deste cliente.",
          fullWidth: true
        },
        {
          name: "activityIds",
          source: "activities",
          label: "Atividades deste cliente",
          type: "multiselect",
          searchable: true,
          options: activityOptions,
          description: "Selecione uma ou mais atividades que fazem parte do atendimento neste cliente.",
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
          headerClassName: "w-[34%]",
          className: "min-w-[260px]",
          value: (item) => {
            const code = textValue(item.code, "Sem codigo");
            const document = textValue(item.document, "Sem documento");
            const company = companyLabel(item.company as CompanyOption | null | undefined);
            const promoter = promoterLabel(item.defaultPromoter);
            const representative = textValue(item.representative, "Nao informado");

            return (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-forest">
                    {code}
                  </span>
                  <strong className="text-base leading-tight text-ink">{textValue(item.name)}</strong>
                </div>
                <div className="text-xs font-semibold text-stone-500">Documento: {document}</div>
                <div className="text-xs font-semibold text-stone-500">Empresa: {company}</div>
                <div className="text-xs font-semibold text-stone-500">Representante: {representative}</div>
                <div className="text-xs font-semibold text-stone-500">Promotor: {promoter}</div>
              </div>
            );
          }
        },
        {
          label: "Endereco",
          headerClassName: "w-[34%]",
          className: "min-w-[240px]",
          value: (item) => {
            const street = textValue(item.address, "Sem endereco");
            const number = item.addressNumber ? `, ${String(item.addressNumber)}` : "";
            const district = item.district ? String(item.district) : "Sem bairro";

            return (
              <div className="space-y-1">
                <strong className="block leading-snug text-ink">{street}{number}</strong>
                <span className="block text-xs font-semibold text-stone-500">Bairro: {district}</span>
              </div>
            );
          }
        },
        {
          label: "Cidade/UF",
          headerClassName: "w-[16%]",
          className: "min-w-[150px]",
          value: (item) => (
            <div className="font-bold leading-snug text-ink">
              {textValue(item.city)}/{textValue(item.state)}
            </div>
          )
        },
        {
          label: "Atividades",
          headerClassName: "w-[18%]",
          className: "min-w-[200px]",
          value: (item) => {
            const activities = Array.isArray(item.activities) ? item.activities as Array<Record<string, unknown>> : [];

            if (activities.length === 0) {
              return <span className="text-sm font-semibold text-stone-500">Nao vinculadas</span>;
            }

            return (
              <div className="flex flex-wrap gap-1.5">
                {activities.slice(0, 3).map((activity) => (
                  <span key={String(activity.id)} className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-700">
                    {textValue(activity.name)}
                  </span>
                ))}
                {activities.length > 3 ? (
                  <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-black text-slateText">+{activities.length - 3}</span>
                ) : null}
              </div>
            );
          }
        },
        {
          label: "Fornecedores",
          headerClassName: "w-[16%]",
          className: "min-w-[180px]",
          value: (item) => {
            const suppliers = Array.isArray(item.suppliers) ? item.suppliers as Array<Record<string, unknown>> : [];

            if (suppliers.length === 0) {
              return <span className="text-sm font-semibold text-stone-500">Nao vinculados</span>;
            }

            return (
              <div className="flex flex-wrap gap-1.5">
                {suppliers.slice(0, 3).map((supplier) => (
                  <span key={String(supplier.id)} className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-brand">
                    {textValue(supplier.tradeName, textValue(supplier.name))}
                  </span>
                ))}
                {suppliers.length > 3 ? (
                  <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-black text-slateText">+{suppliers.length - 3}</span>
                ) : null}
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

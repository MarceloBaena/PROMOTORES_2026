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

function supplierName(link: unknown) {
  const supplier = (link as { supplier?: { name?: string | null; tradeName?: string | null } } | null | undefined)
    ?.supplier;
  const tradeName = supplier?.tradeName?.trim();
  const name = supplier?.name?.trim();
  return tradeName || name || "Fornecedor";
}

function supplierMetrics(link: unknown) {
  const supplier = (link as {
    supplier?: {
      categories?: Array<unknown>;
      activities?: Array<unknown>;
    };
  } | null | undefined)?.supplier;

  return {
    categories: Array.isArray(supplier?.categories) ? supplier.categories.length : 0,
    activities: Array.isArray(supplier?.activities) ? supplier.activities.length : 0
  };
}

export function ClientsPage() {
  const { user } = useAuth();
  const [promoterOptions, setPromoterOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [companyOptions, setCompanyOptions] = useState<Array<{ value: string; label: string }>>([]);
  const isPlatformAdmin = user?.role === "ADMIN" && !user.companyId;

  useEffect(() => {
    void (async () => {
      try {
        const [promotersResponse, companiesResponse] = await Promise.all([
          apiJson<{ data: Array<Record<string, unknown>> }>("/promoters"),
          apiJson<{ data: CompanyOption[] }>("/companies")
        ]);
        setPromoterOptions(
          promotersResponse.data
            .map((promoter) => ({
              value: String(promoter.id ?? ""),
              label: promoterLabel(promoter)
            }))
            .filter((option) => option.value !== "")
        );
        setCompanyOptions(toCompanyOptions(companiesResponse.data));
      } catch {
        setPromoterOptions([]);
        setCompanyOptions([]);
      }
    })();
  }, []);

  return (
    <CrudPage
      title="Clientes"
      subtitle="Cadastro comercial e operacional dos pontos de atendimento usados na roteirizacao e nas visitas de campo."
      endpoint="/clients"
      searchHint="Busque por codigo, cliente, nome fantasia, documento, endereco, bairro, cidade, empresa ou promotor responsavel."
      formSubtitle="Preencha a ficha do cliente com os dados usados no painel e no aplicativo do promotor."
      formPlacement="top"
      startFormCollapsed
      createButtonLabel="Incluir cliente"
      initialValues={{
        code: "",
        companyId: user?.companyId ?? "",
        name: "",
        tradeName: "",
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
        { name: "name", label: "Nome/Razao social", fullWidth: true },
        {
          name: "tradeName",
          label: "Nome fantasia",
          description: "Nome comercial conhecido pela equipe de vendas e promotores.",
          fullWidth: true
        },
        { name: "document", label: "Documento" },
        {
          name: "representative",
          label: "Representante",
          description: "Nome do vendedor ou representante comercial que atende este cliente.",
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
      fieldSections={[
        {
          title: "Identificacao",
          description: "Dados principais do cliente para localizar e controlar o cadastro.",
          columns: 2,
          fields: ["code", "name", "tradeName", "document", "status"]
        },
        {
          title: "Vinculos operacionais",
          description: "Defina a empresa, o representante comercial e o promotor responsavel.",
          columns: 2,
          fields: [
            ...(isPlatformAdmin ? ["companyId"] : []),
            "representative",
            "defaultPromoterId"
          ]
        },
        {
          title: "Endereco",
          description: "Informacoes usadas no roteiro e no app de campo.",
          columns: 2,
          fields: ["address", "addressNumber", "district", "city", "state", "latitude", "longitude"]
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
            const tradeName = String(item.tradeName ?? "").trim();
            const legalName = textValue(item.name);
            const company = companyLabel(item.company as CompanyOption | null | undefined);
            const representative = textValue(item.representative, "Sem representante");
            const promoter = promoterLabel(item.defaultPromoter);

            return (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-forest">
                    {code}
                  </span>
                  <strong className="text-base leading-tight text-ink">
                    {tradeName || legalName}
                  </strong>
                </div>
                {tradeName && tradeName !== legalName ? (
                  <div className="text-xs font-semibold text-stone-500">Razao social: {legalName}</div>
                ) : null}
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
          headerClassName: "w-[26%]",
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
          label: "Fornecedores",
          headerClassName: "w-[22%]",
          className: "min-w-[220px]",
          value: (item) => {
            const links = Array.isArray(item.suppliers) ? item.suppliers : [];
            const visibleSuppliers = links.slice(0, 2);
            const totals = links.reduce(
              (acc, link) => {
                const metrics = supplierMetrics(link);
                return {
                  categories: acc.categories + metrics.categories,
                  activities: acc.activities + metrics.activities
                };
              },
              { categories: 0, activities: 0 }
            );

            if (links.length === 0) {
              return (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">
                  Sem fornecedor vinculado
                </div>
              );
            }

            return (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {visibleSuppliers.map((link, index) => (
                    <span
                      key={`${supplierName(link)}-${index}`}
                      className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-blue-700"
                    >
                      {supplierName(link)}
                    </span>
                  ))}
                  {links.length > visibleSuppliers.length ? (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-black text-slate-600">
                      +{links.length - visibleSuppliers.length}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs font-semibold text-stone-500">
                  {links.length} fornecedor(es) | {totals.categories} categoria(s) | {totals.activities} atividade(s)
                </div>
              </div>
            );
          }
        },
        {
          label: "Cidade/UF",
          headerClassName: "w-[12%]",
          className: "min-w-[150px]",
          value: (item) => (
            <div className="font-bold leading-snug text-ink">
              {textValue(item.city)}/{textValue(item.state)}
            </div>
          )
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

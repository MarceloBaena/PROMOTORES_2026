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
      endpoint="/clients"
      initialValues={{
        code: "",
        companyId: user?.companyId ?? "",
        name: "",
        document: "",
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
          label: "Código",
          placeholder: "Automático",
          description: "Gerado automaticamente pelo sistema em sequência numérica.",
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
          name: "defaultPromoterId",
          label: "Promotor responsavel",
          type: "select",
          searchable: true,
          placeholder: "Selecione o promotor",
          options: promoterOptions,
          description: "Promotor padrao que atendera este cliente em campo.",
          fullWidth: true
        },
        { name: "address", label: "Endereço", fullWidth: true },
        { name: "addressNumber", label: "Número" },
        { name: "district", label: "Bairro" },
        { name: "city", label: "Cidade" },
        { name: "state", label: "UF" },
        { name: "latitude", label: "Latitude" },
        { name: "longitude", label: "Longitude" },
        {
          name: "status",
          label: "Situação",
          type: "select",
          options: [
            { value: "ACTIVE", label: "Ativo" },
            { value: "INACTIVE", label: "Inativo" },
            { value: "ARCHIVED", label: "Arquivado" }
          ]
        }
      ]}
      columns={[
        { label: "Código", value: (item) => String(item.code ?? "-") },
        { label: "Empresa/Filial", value: (item) => companyLabel(item.company as CompanyOption | null | undefined) },
        { label: "Nome", value: (item) => String(item.name ?? "-") },
        { label: "Promotor", value: (item) => promoterLabel(item.defaultPromoter) },
        {
          label: "Endereço",
          value: (item) => {
            const street = String(item.address ?? "-");
            const number = item.addressNumber ? `, ${String(item.addressNumber)}` : "";
            const district = item.district ? ` - ${String(item.district)}` : "";
            return `${street}${number}${district}`;
          }
        },
        { label: "Cidade", value: (item) => `${String(item.city ?? "-")}/${String(item.state ?? "-")}` },
        { label: "Situação", value: (item) => <StatusPill value={String(item.status ?? "")} /> }
      ]}
    />
  );
}

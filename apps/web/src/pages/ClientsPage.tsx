import { useEffect, useState } from "react";
import { StatusPill } from "../components/StatusPill";
import { apiJson } from "../lib/api";
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
  const [promoterOptions, setPromoterOptions] = useState<Array<{ value: string; label: string }>>([]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await apiJson<{ data: Array<Record<string, unknown>> }>("/promoters");
        setPromoterOptions(
          response.data
            .map((promoter) => ({
              value: String(promoter.id ?? ""),
              label: promoterLabel(promoter)
            }))
            .filter((option) => option.value !== "")
        );
      } catch {
        setPromoterOptions([]);
      }
    })();
  }, []);

  return (
    <CrudPage
      title="Clientes"
      endpoint="/clients"
      initialValues={{
        code: "",
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
          label: "Codigo",
          placeholder: "Automatico",
          description: "Gerado automaticamente pelo sistema em sequencia numerica.",
          readOnly: true,
          noSubmit: true
        },
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
        { name: "address", label: "Endereco", fullWidth: true },
        { name: "addressNumber", label: "Numero" },
        { name: "district", label: "Bairro" },
        { name: "city", label: "Cidade" },
        { name: "state", label: "UF" },
        { name: "latitude", label: "Latitude" },
        { name: "longitude", label: "Longitude" },
        { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE", "ARCHIVED"] }
      ]}
      columns={[
        { label: "Codigo", value: (item) => String(item.code ?? "-") },
        { label: "Nome", value: (item) => String(item.name ?? "-") },
        { label: "Promotor", value: (item) => promoterLabel(item.defaultPromoter) },
        {
          label: "Endereco",
          value: (item) => {
            const street = String(item.address ?? "-");
            const number = item.addressNumber ? `, ${String(item.addressNumber)}` : "";
            const district = item.district ? ` - ${String(item.district)}` : "";
            return `${street}${number}${district}`;
          }
        },
        { label: "Cidade", value: (item) => `${String(item.city ?? "-")}/${String(item.state ?? "-")}` },
        { label: "Status", value: (item) => <StatusPill value={String(item.status ?? "")} /> }
      ]}
    />
  );
}

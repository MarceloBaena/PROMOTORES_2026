import { StatusPill } from "../components/StatusPill";
import { CrudPage } from "./CrudPage";

function companyCode(item: Record<string, unknown>) {
  const code = Number(item.code);
  return Number.isFinite(code) && code > 0 ? String(code).padStart(3, "0") : "-";
}

export function CompaniesPage() {
  return (
    <CrudPage
      title="Empresas/Filiais"
      endpoint="/companies"
      initialValues={{
        code: "",
        name: "",
        document: "",
        contactName: "",
        contactPhone: "",
        contactEmail: "",
        address: "",
        addressNumber: "",
        district: "",
        city: "",
        state: "",
        status: "ACTIVE"
      }}
      fields={[
        {
          name: "code",
          label: "Código",
          placeholder: "Automático",
          description: "Gerado automaticamente em sequência numérica.",
          readOnly: true,
          noSubmit: true
        },
        { name: "name", label: "Nome da empresa/filial", required: true, fullWidth: true },
        { name: "document", label: "CNPJ", placeholder: "Opcional" },
        { name: "contactName", label: "Contato" },
        { name: "contactPhone", label: "Telefone" },
        { name: "contactEmail", label: "E-mail de contato", type: "email" },
        { name: "address", label: "Endereço", fullWidth: true },
        { name: "addressNumber", label: "Número" },
        { name: "district", label: "Bairro" },
        { name: "city", label: "Cidade" },
        { name: "state", label: "UF" },
        {
          name: "status",
          label: "Situação",
          type: "select",
          options: [
            { value: "ACTIVE", label: "Ativa" },
            { value: "INACTIVE", label: "Inativa" }
          ]
        }
      ]}
      columns={[
        { label: "Código", value: companyCode },
        { label: "Nome", value: (item) => String(item.name ?? "-") },
        { label: "CNPJ", value: (item) => String(item.document ?? "-") },
        { label: "Contato", value: (item) => String(item.contactName ?? "-") },
        { label: "Cidade", value: (item) => `${String(item.city ?? "-")}/${String(item.state ?? "-")}` },
        { label: "Situação", value: (item) => <StatusPill value={String(item.status ?? "")} /> }
      ]}
    />
  );
}

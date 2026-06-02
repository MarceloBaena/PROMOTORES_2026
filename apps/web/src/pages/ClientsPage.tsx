import { StatusPill } from "../components/StatusPill";
import { CrudPage } from "./CrudPage";

export function ClientsPage() {
  return (
    <CrudPage
      title="Clientes"
      endpoint="/clients"
      initialValues={{ code: "", name: "", document: "", address: "", city: "", state: "", latitude: "", longitude: "", status: "ACTIVE" }}
      fields={[
        { name: "code", label: "Codigo" },
        { name: "name", label: "Nome" },
        { name: "document", label: "Documento" },
        { name: "address", label: "Endereco" },
        { name: "city", label: "Cidade" },
        { name: "state", label: "UF" },
        { name: "latitude", label: "Latitude" },
        { name: "longitude", label: "Longitude" },
        { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE", "ARCHIVED"] }
      ]}
      columns={[
        { label: "Codigo", value: (item) => String(item.code ?? "-") },
        { label: "Nome", value: (item) => String(item.name ?? "-") },
        { label: "Cidade", value: (item) => `${String(item.city ?? "-")}/${String(item.state ?? "-")}` },
        { label: "Status", value: (item) => <StatusPill value={String(item.status ?? "")} /> }
      ]}
    />
  );
}

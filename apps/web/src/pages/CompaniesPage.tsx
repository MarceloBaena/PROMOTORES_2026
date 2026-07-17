import { StatusPill } from "../components/StatusPill";
import { CrudPage } from "./CrudPage";
import { useAuth } from "../context/AuthContext";

function companyCode(item: Record<string, unknown>) {
  const code = Number(item.code);

  if (!Number.isFinite(code) || code <= 0) {
    return "-";
  }

  return String(code).padStart(3, "0");
}

function textValue(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : fallback;
}

export function CompaniesPage() {
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === "ADMIN" && !user.companyId;

  return (
    <CrudPage
      title="Empresas/Filiais"
      subtitle="Base estrutural da operacao. Cada empresa organiza clientes, fornecedores, categorias, atividades e equipe."
      endpoint="/companies"
      searchHint="Busque por codigo, nome da empresa, CNPJ, contato, bairro, cidade ou situacao."
      formMode="drawer"
      createTitle="Incluir empresa/filial"
      editTitle="Alterar empresa/filial"
      formSubtitle="Base comercial da operacao. Cada empresa organiza clientes, fornecedores, categorias e equipe."
      createButtonLabel="Nova empresa"
      canCreate={isPlatformAdmin}
      searchPlaceholder="Buscar por codigo, nome, CNPJ, contato, cidade, bairro ou situacao"
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
      fieldSections={[
        {
          title: "Identificacao da empresa",
          description: "Dados principais do cadastro comercial.",
          fields: ["code", "name", "document", "status"]
        },
        {
          title: "Contato principal",
          description: "Responsavel e canais de comunicacao.",
          fields: ["contactName", "contactPhone", "contactEmail"]
        },
        {
          title: "Endereco da operacao",
          description: "Localizacao usada no contexto da filial.",
          fields: ["address", "addressNumber", "district", "city", "state"]
        }
      ]}
      fields={[
        {
          name: "code",
          label: "Codigo",
          placeholder: "Automatico",
          description: "Gerado automaticamente em sequencia numerica.",
          readOnly: true,
          noSubmit: true
        },
        { name: "name", label: "Nome da empresa/filial", required: true, fullWidth: true },
        { name: "document", label: "CNPJ", placeholder: "Opcional" },
        { name: "contactName", label: "Contato" },
        { name: "contactPhone", label: "Telefone" },
        { name: "contactEmail", label: "E-mail de contato", type: "email" },
        { name: "address", label: "Endereco", fullWidth: true },
        { name: "addressNumber", label: "Numero" },
        { name: "district", label: "Bairro" },
        { name: "city", label: "Cidade" },
        { name: "state", label: "UF" },
        {
          name: "status",
          label: "Situacao",
          type: "select",
          options: [
            { value: "ACTIVE", label: "Ativa" },
            { value: "INACTIVE", label: "Inativa" }
          ]
        }
      ]}
      columns={[
        {
          label: "Empresa",
          headerClassName: "w-[30%]",
          className: "min-w-[250px]",
          value: (item) => (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-forest">
                  {companyCode(item)}
                </span>
                <strong className="text-base leading-tight text-ink">{textValue(item.name)}</strong>
              </div>
              <div className="text-xs font-semibold text-stone-500">CNPJ: {textValue(item.document, "Nao informado")}</div>
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
              <span className="block text-xs font-semibold text-stone-500">Telefone: {textValue(item.contactPhone, "Nao informado")}</span>
              <span className="block text-xs font-semibold text-stone-500">E-mail: {textValue(item.contactEmail, "Nao informado")}</span>
            </div>
          )
        },
        {
          label: "Endereco",
          headerClassName: "w-[30%]",
          className: "min-w-[250px]",
          value: (item) => {
            const street = textValue(item.address, "Sem endereco");
            const number = item.addressNumber ? `, ${String(item.addressNumber)}` : "";

            return (
              <div className="space-y-1">
                <strong className="block leading-snug text-ink">{street}{number}</strong>
                <span className="block text-xs font-semibold text-stone-500">Bairro: {textValue(item.district, "Nao informado")}</span>
                <span className="block text-xs font-semibold text-stone-500">{textValue(item.city)}/{textValue(item.state)}</span>
              </div>
            );
          }
        },
        {
          label: "Situacao",
          headerClassName: "w-[16%]",
          className: "min-w-[120px]",
          value: (item) => <StatusPill value={String(item.status ?? "")} />
        }
      ]}
    />
  );
}

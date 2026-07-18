import { useEffect, useState } from "react";
import { CrudPage, userEmail, userName, userStatus } from "./CrudPage";
import { useAuth } from "../context/AuthContext";
import { apiJson } from "../lib/api";
import { companyLabel, toCompanyOptions, type CompanyOption } from "../lib/company-options";

function numericCode(item: Record<string, unknown>, prefix: "PRO" | "SUP") {
  const code = Number(item.code);

  if (!Number.isFinite(code) || code <= 0) {
    return <span className="font-mono text-xs font-bold text-stone-400">-</span>;
  }

  return (
    <span className="inline-flex h-8 items-center rounded-full border border-line bg-field px-3 font-mono text-xs font-black tracking-[0.12em] text-graphite">
      {prefix}-{String(code).padStart(4, "0")}
    </span>
  );
}

function promoterPhone(item: Record<string, unknown>) {
  const phone = String(item.phone ?? "").trim();
  return phone.length > 0 ? phone : "Nao informado";
}

function promoterContact(item: Record<string, unknown>) {
  return (
    <div className="space-y-1">
      <strong className="block leading-snug text-ink">{userEmail(item)}</strong>
      <span className="block text-xs font-semibold text-stone-500">Telefone: {promoterPhone(item)}</span>
    </div>
  );
}

export function PromotersPage() {
  const { user } = useAuth();
  const [supervisorOptions, setSupervisorOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [companyOptions, setCompanyOptions] = useState<Array<{ value: string; label: string }>>([]);
  const isPlatformAdmin = user?.role === "ADMIN" && !user.companyId;

  useEffect(() => {
    void (async () => {
      try {
        const [supervisorsResponse, companiesResponse] = await Promise.all([
          apiJson<{ data: Array<Record<string, unknown>> }>("/supervisors"),
          apiJson<{ data: CompanyOption[] }>("/companies")
        ]);
        setSupervisorOptions(
          supervisorsResponse.data
            .map((supervisor) => {
              const supervisorUser = supervisor.user as { name?: string } | undefined;
              const id = String(supervisor.id ?? "");
              const code = Number(supervisor.code);
              const displayCode = Number.isFinite(code) && code > 0 ? `SUP-${String(code).padStart(4, "0")}` : id;
              return {
                value: id,
                label: supervisorUser?.name ? `${displayCode} - ${supervisorUser.name}` : displayCode
              };
            })
            .filter((option) => option.value !== "")
        );
        setCompanyOptions(toCompanyOptions(companiesResponse.data));
      } catch {
        setSupervisorOptions([]);
        setCompanyOptions([]);
      }
    })();
  }, []);

  return (
    <CrudPage
      title="Promotores"
      subtitle="Cadastro da equipe de campo com supervisor vinculado, telefone do aparelho e credenciais do aplicativo."
      endpoint="/promoters"
      searchHint="Busque por codigo, nome, e-mail, telefone, empresa ou supervisor responsavel."
      formPlacement="top"
      startFormCollapsed
      formSubtitle="Use este cadastro para liberar o promotor no aplicativo, registrar o telefone e definir quem acompanha a operacao."
      initialValues={{ name: "", email: "", password: "", phone: "", companyId: user?.companyId ?? "", supervisorId: "" }}
      fields={[
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
        { name: "name", source: "user.name", label: "Nome", placeholder: "Nome do promotor", required: true, fullWidth: true },
        { name: "email", source: "user.email", label: "E-mail", type: "email", placeholder: "email@exemplo.com", required: true, fullWidth: true },
        {
          name: "phone",
          label: "Telefone do promotor",
          placeholder: "(00) 00000-0000",
          description: "Numero usado para controle do aparelho ou contato operacional.",
          fullWidth: true
        },
        {
          name: "password",
          label: "Senha",
          type: "password",
          placeholder: "Minimo de 8 caracteres",
          description: "Se deixar em branco, o sistema usa a senha padrao Promotor@123.",
          minLength: 8,
          fullWidth: true
        },
        {
          name: "supervisorId",
          label: "Supervisor",
          type: "select",
          searchable: true,
          placeholder: "Selecione um supervisor",
          description: "Digite parte do nome para filtrar o supervisor cadastrado.",
          options: supervisorOptions,
          fullWidth: true
        }
      ]}
      columns={[
        { label: "Codigo", value: (item) => numericCode(item, "PRO") },
        { label: "Empresa/Filial", value: (item) => companyLabel(item.company as CompanyOption | null | undefined) },
        { label: "Nome", value: userName },
        { label: "Contato", value: promoterContact },
        { label: "Situacao", value: userStatus },
        {
          label: "Supervisor",
          value: (item) => {
            const supervisor = item.supervisor as { user?: { name?: string } } | undefined;
            return supervisor?.user?.name ?? "-";
          }
        }
      ]}
    />
  );
}

export function SupervisorsPage() {
  const { user } = useAuth();
  const [companyOptions, setCompanyOptions] = useState<Array<{ value: string; label: string }>>([]);
  const isPlatformAdmin = user?.role === "ADMIN" && !user.companyId;

  useEffect(() => {
    void (async () => {
      try {
        const response = await apiJson<{ data: CompanyOption[] }>("/companies");
        setCompanyOptions(toCompanyOptions(response.data));
      } catch {
        setCompanyOptions([]);
      }
    })();
  }, []);

  return (
    <CrudPage
      title="Supervisores"
      subtitle="Cadastro da lideranca de campo responsavel por acompanhar promotores, rotas, auditorias e produtividade."
      endpoint="/supervisors"
      searchHint="Busque por codigo, nome, e-mail, empresa ou regiao."
      formPlacement="top"
      startFormCollapsed
      formSubtitle="Cadastre os supervisores que vao acompanhar a operacao e responder pela equipe em campo."
      initialValues={{ name: "", email: "", password: "", companyId: user?.companyId ?? "", region: "" }}
      fields={[
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
        { name: "name", source: "user.name", label: "Nome", required: true },
        { name: "email", source: "user.email", label: "E-mail", type: "email", required: true },
        { name: "password", label: "Senha", type: "password", minLength: 8 },
        { name: "region", label: "Regiao" }
      ]}
      columns={[
        { label: "Codigo", value: (item) => numericCode(item, "SUP") },
        { label: "Empresa/Filial", value: (item) => companyLabel(item.company as CompanyOption | null | undefined) },
        { label: "Nome", value: userName },
        { label: "E-mail", value: userEmail },
        { label: "Situacao", value: userStatus },
        { label: "Regiao", value: (item) => String(item.region ?? "-") }
      ]}
    />
  );
}

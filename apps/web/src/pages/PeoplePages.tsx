import { useEffect, useState } from "react";
import { CrudPage, userEmail, userName, userStatus } from "./CrudPage";
import { useAuth } from "../context/AuthContext";
import { apiJson } from "../lib/api";
import { companyLabel, toCompanyOptions, type CompanyOption } from "../lib/company-options";
import { formatPhone } from "../lib/phone";

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
              const profile = supervisor.user as { name?: string } | undefined;
              const id = String(supervisor.id ?? "");
              const code = Number(supervisor.code);
              const displayCode = Number.isFinite(code) && code > 0 ? `SUP-${String(code).padStart(4, "0")}` : id;

              return {
                value: id,
                label: profile?.name ? `${displayCode} - ${profile.name}` : displayCode
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
      endpoint="/promoters"
      formMode="drawer"
      createTitle="Incluir promotor"
      editTitle="Alterar promotor"
      formSubtitle="Cadastro da equipe de campo com empresa, supervisor responsavel e telefone do aparelho."
      createButtonLabel="Novo promotor"
      searchPlaceholder="Buscar por codigo, nome, e-mail, telefone, supervisor ou empresa"
      initialValues={{ name: "", email: "", phone: "", password: "", companyId: user?.companyId ?? "", supervisorId: "" }}
      fieldSections={[
        {
          title: "Identificacao do promotor",
          description: "Dados usados no acesso e na identificacao da equipe.",
          fields: ["name", "email", "password"],
          columns: 1
        },
        {
          title: "Vinculo operacional",
          description: "Empresa, supervisor direto e telefone do aparelho.",
          fields: isPlatformAdmin ? ["companyId", "supervisorId", "phone"] : ["supervisorId", "phone"]
        }
      ]}
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
          name: "password",
          label: "Senha",
          type: "password",
          placeholder: "Minimo de 8 caracteres",
          description: "No cadastro informe a senha inicial. Na alteracao, preencha apenas se quiser trocar.",
          minLength: 8,
          fullWidth: true
        },
        {
          name: "supervisorId",
          label: "Supervisor",
          type: "select",
          searchable: true,
          placeholder: "Selecione um supervisor",
          options: supervisorOptions,
          fullWidth: true
        },
        {
          name: "phone",
          label: "Telefone",
          type: "tel",
          format: "phone",
          placeholder: "(65) 99999-9999",
          fullWidth: true
        }
      ]}
      columns={[
        {
          label: "Promotor",
          headerClassName: "w-[26%]",
          className: "min-w-[220px]",
          value: (item) => (
            <div className="space-y-1.5">
              {numericCode(item, "PRO")}
              <strong className="block text-base leading-tight text-ink">{userName(item)}</strong>
            </div>
          )
        },
        {
          label: "Contato",
          headerClassName: "w-[26%]",
          className: "min-w-[220px]",
          value: (item) => (
            <div className="space-y-1">
              <strong className="block leading-snug text-ink">{userEmail(item)}</strong>
              <span className="block text-xs font-semibold text-stone-500">Telefone: {formatPhone(item.phone) || "Nao informado"}</span>
            </div>
          )
        },
        {
          label: "Vinculo",
          headerClassName: "w-[28%]",
          className: "min-w-[240px]",
          value: (item) => {
            const supervisor = item.supervisor as { user?: { name?: string } } | undefined;

            return (
              <div className="space-y-1">
                <strong className="block leading-snug text-ink">{companyLabel(item.company as CompanyOption | null | undefined)}</strong>
                <span className="block text-xs font-semibold text-stone-500">Supervisor: {supervisor?.user?.name ?? "Nao vinculado"}</span>
              </div>
            );
          }
        },
        {
          label: "Situacao",
          headerClassName: "w-[12%]",
          className: "min-w-[120px]",
          value: userStatus
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
      endpoint="/supervisors"
      formMode="drawer"
      createTitle="Incluir supervisor"
      editTitle="Alterar supervisor"
      formSubtitle="Cadastro dos supervisores responsaveis pela equipe, regiao e acompanhamento da operacao."
      createButtonLabel="Novo supervisor"
      searchPlaceholder="Buscar por codigo, nome, e-mail, regiao ou empresa"
      initialValues={{ name: "", email: "", password: "", companyId: user?.companyId ?? "", region: "" }}
      fieldSections={[
        {
          title: "Identificacao do supervisor",
          description: "Dados de acesso e identificacao do responsavel.",
          fields: ["name", "email", "password"],
          columns: 1
        },
        {
          title: "Cobertura operacional",
          description: "Empresa vinculada e regiao de atuacao.",
          fields: isPlatformAdmin ? ["companyId", "region"] : ["region"]
        }
      ]}
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
        {
          name: "password",
          label: "Senha",
          type: "password",
          minLength: 8,
          description: "Na alteracao, informe apenas se quiser redefinir a senha."
        },
        { name: "region", label: "Regiao" }
      ]}
      columns={[
        {
          label: "Supervisor",
          headerClassName: "w-[28%]",
          className: "min-w-[220px]",
          value: (item) => (
            <div className="space-y-1.5">
              {numericCode(item, "SUP")}
              <strong className="block text-base leading-tight text-ink">{userName(item)}</strong>
            </div>
          )
        },
        {
          label: "Contato",
          headerClassName: "w-[24%]",
          className: "min-w-[220px]",
          value: (item) => <strong className="block leading-snug text-ink">{userEmail(item)}</strong>
        },
        {
          label: "Cobertura",
          headerClassName: "w-[28%]",
          className: "min-w-[220px]",
          value: (item) => (
            <div className="space-y-1">
              <strong className="block leading-snug text-ink">{companyLabel(item.company as CompanyOption | null | undefined)}</strong>
              <span className="block text-xs font-semibold text-stone-500">Regiao: {String(item.region ?? "Nao informada")}</span>
            </div>
          )
        },
        {
          label: "Situacao",
          headerClassName: "w-[12%]",
          className: "min-w-[120px]",
          value: userStatus
        }
      ]}
    />
  );
}

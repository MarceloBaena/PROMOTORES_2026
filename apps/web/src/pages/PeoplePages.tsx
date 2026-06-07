import { useEffect, useState } from "react";
import { CrudPage, userEmail, userName, userStatus } from "./CrudPage";
import { apiJson } from "../lib/api";

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
  const [supervisorOptions, setSupervisorOptions] = useState<Array<{ value: string; label: string }>>([]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await apiJson<{ data: Array<Record<string, unknown>> }>("/supervisors");
        setSupervisorOptions(
          response.data
            .map((supervisor) => {
              const user = supervisor.user as { name?: string } | undefined;
              const id = String(supervisor.id ?? "");
              const code = Number(supervisor.code);
              const displayCode = Number.isFinite(code) && code > 0 ? `SUP-${String(code).padStart(4, "0")}` : id;
              return {
                value: id,
                label: user?.name ? `${displayCode} - ${user.name}` : displayCode
              };
            })
            .filter((option) => option.value !== "")
        );
      } catch {
        setSupervisorOptions([]);
      }
    })();
  }, []);

  return (
    <CrudPage
      title="Promotores"
      endpoint="/promoters"
      initialValues={{ name: "", email: "", password: "", supervisorId: "" }}
      fields={[
        { name: "name", source: "user.name", label: "Nome", placeholder: "Nome do promotor", required: true, fullWidth: true },
        { name: "email", source: "user.email", label: "E-mail", type: "email", placeholder: "email@exemplo.com", required: true, fullWidth: true },
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
        { label: "Nome", value: userName },
        { label: "E-mail", value: userEmail },
        { label: "Status", value: userStatus },
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
  return (
    <CrudPage
      title="Supervisores"
      endpoint="/supervisors"
      initialValues={{ name: "", email: "", password: "", region: "" }}
      fields={[
        { name: "name", source: "user.name", label: "Nome", required: true },
        { name: "email", source: "user.email", label: "E-mail", type: "email", required: true },
        { name: "password", label: "Senha", type: "password", minLength: 8 },
        { name: "region", label: "Regiao" }
      ]}
      columns={[
        { label: "Codigo", value: (item) => numericCode(item, "SUP") },
        { label: "Nome", value: userName },
        { label: "E-mail", value: userEmail },
        { label: "Status", value: userStatus },
        { label: "Regiao", value: (item) => String(item.region ?? "-") }
      ]}
    />
  );
}

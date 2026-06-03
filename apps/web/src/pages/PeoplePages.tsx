import { useEffect, useMemo, useState } from "react";
import { CrudPage, userEmail, userName, userStatus } from "./CrudPage";
import { apiJson } from "../lib/api";

function recordCode(item: Record<string, unknown>) {
  const id = String(item.id ?? "");
  const code = id ? id.slice(0, 8).toUpperCase() : "-";

  return <span className="font-mono text-xs font-bold text-graphite">{code}</span>;
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
              return {
                value: id,
                label: user?.name ? `${user.name}` : id
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
        { name: "name", label: "Nome", placeholder: "Nome do promotor", fullWidth: true },
        { name: "email", label: "E-mail", type: "email", placeholder: "email@exemplo.com", fullWidth: true },
        { name: "password", label: "Senha", type: "password", placeholder: "Senha segura", fullWidth: true },
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
        { name: "name", label: "Nome" },
        { name: "email", label: "E-mail", type: "email" },
        { name: "password", label: "Senha", type: "password" },
        { name: "region", label: "Regiao" }
      ]}
      columns={[
        { label: "Codigo", value: recordCode },
        { label: "Nome", value: userName },
        { label: "E-mail", value: userEmail },
        { label: "Status", value: userStatus },
        { label: "Regiao", value: (item) => String(item.region ?? "-") }
      ]}
    />
  );
}

import { CrudPage, userEmail, userName, userStatus } from "./CrudPage";

function recordCode(item: Record<string, unknown>) {
  const id = String(item.id ?? "");
  const code = id ? id.slice(0, 8).toUpperCase() : "-";

  return <span className="font-mono text-xs font-bold text-graphite">{code}</span>;
}

export function PromotersPage() {
  return (
    <CrudPage
      title="Promotores"
      endpoint="/promoters"
      initialValues={{ name: "", email: "", password: "", supervisorId: "" }}
      fields={[
        { name: "name", label: "Nome" },
        { name: "email", label: "E-mail", type: "email" },
        { name: "password", label: "Senha", type: "password" },
        { name: "supervisorId", label: "Supervisor ID" }
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

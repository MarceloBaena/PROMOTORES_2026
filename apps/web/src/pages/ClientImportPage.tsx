import { FormEvent, useEffect, useState } from "react";
import { FileUp } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { useAuth } from "../context/AuthContext";
import { apiJson } from "../lib/api";
import { companyLabel, type CompanyOption } from "../lib/company-options";

interface ImportLog {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  importedRows: number;
  failedRows: number;
}

export function ClientImportPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState(user?.companyId ?? "");
  const [log, setLog] = useState<ImportLog | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isPlatformAdmin = user?.role === "ADMIN" && !user.companyId;

  useEffect(() => {
    void apiJson<{ data: CompanyOption[] }>("/companies")
      .then((response) => setCompanies(response.data))
      .catch(() => setCompanies([]));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!file) {
      setMessage("Selecione um arquivo CSV.");
      return;
    }

    if (isPlatformAdmin && !companyId) {
      setMessage("Selecione a empresa/filial da importação.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    if (companyId) {
      formData.append("companyId", companyId);
    }
    setLoading(true);
    setMessage(null);

    try {
      const response = await apiJson<{ data: ImportLog }>("/clients/import-csv", {
        method: "POST",
        body: formData
      });
      setLog(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Importação não concluída.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <PageHeader title="Importação CSV" />
      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form onSubmit={onSubmit} className="panel overflow-hidden xl:sticky xl:top-20 xl:self-start">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Arquivo</h2>
            </div>
          </div>
          <div className="p-4">
            <label className="mb-4 block">
              <span className="field-label">Empresa/Filial</span>
              <select
                className="input-control"
                disabled={!isPlatformAdmin}
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
              >
                <option value="">Selecione a empresa/filial</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{companyLabel(company)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Arquivo CSV</span>
              <input
                className="file-control"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {message ? <div className="notice notice-warning mt-4">{message}</div> : null}
            <button type="submit" title="Importar" disabled={loading} className="primary-button mt-4 w-full">
              <FileUp className="h-4 w-4" />
              {loading ? "Importando..." : "Importar"}
            </button>
          </div>
        </form>

        <div className="panel overflow-hidden">
          <div className="panel-header">
            <h2 className="panel-title">Resultado</h2>
          </div>
          {log ? (
            <dl className="grid gap-3 p-4 sm:grid-cols-2">
              <div>
                <dt className="field-label">Arquivo</dt>
                <dd className="mt-1 font-medium">{log.fileName}</dd>
              </div>
              <div>
                <dt className="field-label">Situação</dt>
                <dd className="mt-1"><StatusPill value={log.status} /></dd>
              </div>
              <div>
                <dt className="field-label">Linhas</dt>
                <dd className="mt-1 font-medium">{log.totalRows}</dd>
              </div>
              <div>
                <dt className="field-label">Importadas</dt>
                <dd className="mt-1 font-medium">{log.importedRows}</dd>
              </div>
              <div>
                <dt className="field-label">Falhas</dt>
                <dd className="mt-1 font-medium">{log.failedRows}</dd>
              </div>
            </dl>
          ) : (
            <div className="p-4 text-sm text-stone-500">Nenhuma importação executada nesta sessão.</div>
          )}
        </div>
      </div>
    </section>
  );
}

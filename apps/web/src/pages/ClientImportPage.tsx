import { FormEvent, useEffect, useMemo, useState } from "react";
import { Download, FileUp, FileText, Building2, AlertTriangle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { useAuth } from "../context/AuthContext";
import { useCompanyScope } from "../context/CompanyScopeContext";
import { apiJson } from "../lib/api";
import { activeCompaniesOnly, companyLabel, type CompanyOption } from "../lib/company-options";

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
  const { selectedCompanyId, scopeKey } = useCompanyScope();
  const [file, setFile] = useState<File | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState(user?.companyId ?? selectedCompanyId ?? "");
  const [log, setLog] = useState<ImportLog | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isPlatformAdmin = user?.role === "ADMIN" && !user.companyId;

  useEffect(() => {
    void apiJson<{ data: CompanyOption[] }>("/companies")
      .then((response) => setCompanies(activeCompaniesOnly(response.data)))
      .catch(() => setCompanies([]));
  }, [scopeKey]);

  useEffect(() => {
    setCompanyId(user?.companyId ?? selectedCompanyId ?? "");
  }, [selectedCompanyId, user?.companyId]);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === companyId) ?? null,
    [companies, companyId]
  );

  const importSummary = useMemo(
    () => [
      { label: "Linhas", value: log?.totalRows ?? 0, helper: "total lido da planilha" },
      { label: "Importadas", value: log?.importedRows ?? 0, helper: "clientes criados ou atualizados" },
      { label: "Falhas", value: log?.failedRows ?? 0, helper: "linhas rejeitadas na validacao" }
    ],
    [log]
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!file) {
      setMessage("Selecione o arquivo da planilha.");
      return;
    }

    if (isPlatformAdmin && !companyId) {
      setMessage("Selecione a empresa/filial da importacao.");
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
      setMessage(error instanceof Error ? error.message : "Importacao nao concluida.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <PageHeader
        title="Importacao de clientes"
        subtitle="Carregue a planilha da empresa/filial e acompanhe o resultado da carga no mesmo painel."
      />

      {message ? <div className="notice notice-warning">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={onSubmit} className="panel overflow-hidden xl:sticky xl:top-20 xl:self-start">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Arquivo da importacao</h2>
              <p className="panel-subtitle">Baixe o modelo, escolha a empresa e envie o CSV.</p>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-2xl border border-line bg-field/60 p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slateText">Fluxo rapido</div>
              <div className="mt-3 space-y-2 text-sm font-semibold text-stone-600">
                <div>1. Baixe o modelo oficial da planilha.</div>
                <div>2. Selecione a empresa/filial correta.</div>
                <div>3. Envie o arquivo e confira o resultado.</div>
              </div>
            </div>

            <a
              className="secondary-button w-full justify-center"
              href="/modelo-importacao-clientes.csv"
              download="modelo-importacao-clientes.csv"
            >
              <Download className="h-4 w-4" />
              Baixar modelo de planilha
            </a>

            <label className="block">
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-white p-3">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slateText">
                  <Building2 className="h-4 w-4" />
                  Empresa selecionada
                </div>
                <div className="mt-2 text-sm font-bold text-ink">
                  {selectedCompany ? companyLabel(selectedCompany) : "Nenhuma empresa definida"}
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-white p-3">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slateText">
                  <FileText className="h-4 w-4" />
                  Arquivo
                </div>
                <div className="mt-2 text-sm font-bold text-ink">
                  {file?.name ?? "Nenhum arquivo selecionado"}
                </div>
              </div>
            </div>

            <button type="submit" title="Importar" disabled={loading} className="primary-button w-full">
              <FileUp className="h-4 w-4" />
              {loading ? "Importando..." : "Importar agora"}
            </button>
          </div>
        </form>

        <div className="space-y-4">
          <div className="kpi-strip">
            {importSummary.map((item) => (
              <article key={item.label} className="kpi-tile">
                <div className="kpi-tile-title">{item.label}</div>
                <div className="kpi-tile-value">{item.value}</div>
                <div className="section-helper mt-2">{item.helper}</div>
              </article>
            ))}
          </div>

          <div className="panel overflow-hidden">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Resultado da importacao</h2>
                <p className="panel-subtitle">Resumo da ultima carga executada nesta sessao.</p>
              </div>
              {log ? <StatusPill value={log.status} /> : null}
            </div>

            {log ? (
              <div className="space-y-4 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-line bg-field/60 p-4">
                    <div className="field-label">Arquivo processado</div>
                    <div className="mt-2 text-sm font-bold text-ink">{log.fileName}</div>
                  </div>
                  <div className="rounded-2xl border border-line bg-field/60 p-4">
                    <div className="field-label">Situacao final</div>
                    <div className="mt-2">
                      <StatusPill value={log.status} />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-line bg-white p-4">
                  <div className="field-label">Leitura operacional</div>
                  <div className="mt-3 space-y-2 text-sm font-semibold text-stone-600">
                    <div>Total de linhas: {log.totalRows}</div>
                    <div>Clientes importados: {log.importedRows}</div>
                    <div>Falhas encontradas: {log.failedRows}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5">
                <div className="rounded-2xl border border-dashed border-line bg-field/40 p-5 text-sm font-semibold text-stone-500">
                  Nenhuma importacao executada nesta sessao. Quando voce enviar um arquivo, o resumo aparece aqui.
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex items-center gap-2 text-sm font-black text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Conferencia recomendada
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-amber-900/80">
              Depois da importacao, revise alguns clientes no cadastro para confirmar endereco, representante,
              promotor responsavel e atividades vinculadas.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

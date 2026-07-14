import { FormEvent, useEffect, useMemo, useState } from "react";
import { Download, FileUp, Files, ShieldCheck, TriangleAlert } from "lucide-react";
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

  const importSuccess = useMemo(() => (log ? Math.max(0, log.importedRows) : 0), [log]);
  const importFailures = useMemo(() => (log ? Math.max(0, log.failedRows) : 0), [log]);
  const importTotal = useMemo(() => (log ? Math.max(0, log.totalRows) : 0), [log]);

  return (
    <section>
      <PageHeader
        title="Importacao de planilha"
        subtitle="Envie a planilha padrao de clientes e acompanhe o retorno de linhas processadas, importadas e com falha."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ImportMetric label="Linhas enviadas" value={importTotal} helper="Total processado na ultima importacao desta sessao." icon={Files} tone="brand" />
        <ImportMetric label="Importadas" value={importSuccess} helper="Linhas aceitas e gravadas pelo sistema." icon={ShieldCheck} tone="success" />
        <ImportMetric label="Falhas" value={importFailures} helper="Linhas que precisam de revisao no arquivo." icon={TriangleAlert} tone={importFailures > 0 ? "danger" : "neutral"} />
        <ImportMetric label="Arquivo atual" value={file ? 1 : 0} helper={file ? file.name : "Nenhum arquivo selecionado"} icon={FileUp} tone="brand" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <form onSubmit={onSubmit} className="panel overflow-hidden xl:sticky xl:top-20 xl:self-start">
          <div className="panel-header">
            <div>
              <div className="mb-2">
                <span className="brand-chip">Carga guiada</span>
              </div>
              <h2 className="panel-title">Arquivo de importacao</h2>
              <p className="panel-subtitle">Baixe o modelo, selecione a empresa e envie o CSV com os clientes.</p>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <a
              className="secondary-button w-full justify-center"
              href="/modelo-importacao-clientes.csv"
              download="modelo-importacao-clientes.csv"
            >
              <Download className="h-4 w-4" />
              Baixar modelo da planilha
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

            <div className="rounded-2xl border border-line bg-field px-4 py-4 text-sm font-semibold leading-6 text-slateText">
              Use o modelo padrao para evitar erro de colunas, codigos e campos obrigatorios na importacao.
            </div>

            {message ? <div className="notice notice-warning !mb-0">{message}</div> : null}

            <button type="submit" title="Importar" disabled={loading} className="primary-button w-full">
              <FileUp className="h-4 w-4" />
              {loading ? "Importando..." : "Importar planilha"}
            </button>
          </div>
        </form>

        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Resultado da importacao</h2>
              <p className="panel-subtitle">Resumo da ultima carga executada nesta sessao.</p>
            </div>
          </div>

          {log ? (
            <div className="space-y-4 p-5">
              <div className="rounded-[1.35rem] bg-navy p-4 text-white">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-white/55">Arquivo processado</div>
                <div className="mt-2 font-display text-2xl font-black">{log.fileName}</div>
                <div className="mt-3"><StatusPill value={log.status} /></div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <ResultCard label="Linhas lidas" value={log.totalRows} />
                <ResultCard label="Importadas" value={log.importedRows} />
                <ResultCard label="Falhas" value={log.failedRows} danger={log.failedRows > 0} />
              </div>

              <div className="rounded-2xl border border-line bg-white p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slateText">Leitura do resultado</div>
                <div className="mt-2 text-sm font-semibold leading-6 text-slateText">
                  {log.failedRows > 0
                    ? "A importacao terminou com pendencias. Revise o arquivo e tente novamente apos corrigir as linhas com falha."
                    : "A importacao foi concluida sem falhas para esta sessao."}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid min-h-[340px] place-items-center p-6 text-center">
              <div className="max-w-md">
                <Files className="mx-auto h-10 w-10 text-stone-400" />
                <h3 className="mt-4 text-lg font-black text-ink">Nenhuma importacao executada</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-stone-500">
                  Assim que a planilha for enviada, o resumo da carga vai aparecer aqui com situacao, totais importados e falhas.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ImportMetric({
  label,
  value,
  helper,
  icon: Icon,
  tone
}: {
  label: string;
  value: number;
  helper: string;
  icon: typeof Files;
  tone: "brand" | "success" | "danger" | "neutral";
}) {
  const toneClass = {
    brand: "bg-blue-50 text-brand",
    success: "bg-emerald-50 text-emerald-700",
    danger: "bg-red-50 text-danger",
    neutral: "bg-slate-100 text-slateText"
  }[tone];

  return (
    <div className="metric-card">
      <div className="relative z-[1] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">{label}</div>
          <div className="mt-3 font-display text-3xl font-bold text-ink">{value}</div>
        </div>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="relative z-[1] mt-2 text-xs font-bold leading-5 text-slateText">{helper}</div>
    </div>
  );
}

function ResultCard({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm shadow-slate-900/5">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slateText">{label}</div>
      <div className={`mt-2 text-2xl font-black ${danger ? "text-danger" : "text-ink"}`}>{value}</div>
    </div>
  );
}

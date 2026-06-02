import { FormEvent, useState } from "react";
import { FileUp } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { apiJson } from "../lib/api";

interface ImportLog {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  importedRows: number;
  failedRows: number;
}

export function ClientImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [log, setLog] = useState<ImportLog | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!file) {
      setMessage("Selecione um arquivo CSV.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
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
      <PageHeader title="Importacao CSV" />
      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={onSubmit} className="rounded-lg border border-line bg-white p-4 shadow-sm">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Arquivo CSV</span>
            <input
              className="focus-ring w-full rounded-md border border-line bg-white px-3 py-2"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {message ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{message}</div> : null}
          <button
            type="submit"
            title="Importar"
            disabled={loading}
            className="focus-ring mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-moss px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            <FileUp className="h-4 w-4" />
            {loading ? "Importando..." : "Importar"}
          </button>
        </form>

        <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-base font-bold">Resultado</h2>
          {log ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-semibold text-stone-500">Arquivo</dt>
                <dd className="mt-1 font-medium">{log.fileName}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-stone-500">Status</dt>
                <dd className="mt-1"><StatusPill value={log.status} /></dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-stone-500">Linhas</dt>
                <dd className="mt-1 font-medium">{log.totalRows}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-stone-500">Importadas</dt>
                <dd className="mt-1 font-medium">{log.importedRows}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-stone-500">Falhas</dt>
                <dd className="mt-1 font-medium">{log.failedRows}</dd>
              </div>
            </dl>
          ) : (
            <div className="text-sm text-stone-500">Nenhuma importacao executada nesta sessao.</div>
          )}
        </div>
      </div>
    </section>
  );
}

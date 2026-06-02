import { Download } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { apiDownload, triggerDownload } from "../lib/api";

const reports = [
  { label: "Visitas CSV", path: "/reports/visits.csv", fileName: "visits.csv" },
  { label: "Clientes Excel", path: "/reports/clients.xls", fileName: "clients.xls" },
  { label: "Auditoria PDF", path: "/reports/audit.pdf", fileName: "audit.pdf" }
];

export function ReportsPage() {
  async function download(path: string, fileName: string) {
    const blob = await apiDownload(path);
    triggerDownload(blob, fileName);
  }

  return (
    <section>
      <PageHeader title="Relatorios" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <div key={report.path} className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <div className="mb-4 text-base font-bold">{report.label}</div>
            <button
              type="button"
              title="Baixar"
              onClick={() => void download(report.path, report.fileName)}
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-moss px-4 text-sm font-semibold text-white"
            >
              <Download className="h-4 w-4" />
              Baixar
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

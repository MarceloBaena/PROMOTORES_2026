import { Download } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { apiDownload, triggerDownload } from "../lib/api";

const reports = [
  { label: "Visitas em arquivo", path: "/reports/visits.csv", fileName: "visitas.csv" },
  { label: "Clientes em planilha", path: "/reports/clients.xls", fileName: "clientes.xls" },
  { label: "Auditoria em PDF", path: "/reports/audit.pdf", fileName: "auditoria.pdf" }
];

export function ReportsPage() {
  async function download(path: string, fileName: string) {
    const blob = await apiDownload(path);
    triggerDownload(blob, fileName);
  }

  return (
    <section>
      <PageHeader title="Relatórios" />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Relatório</th>
              <th>Arquivo</th>
              <th className="w-28">Ação</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.path}>
                <td className="font-medium">{report.label}</td>
                <td>{report.fileName}</td>
                <td>
                  <button type="button" title="Baixar" onClick={() => void download(report.path, report.fileName)} className="icon-button text-moss">
                    <Download className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

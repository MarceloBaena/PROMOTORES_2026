import { Router } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { scopedCompanyWhere } from "../lib/tenant";

export const reportsRouter = Router();

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function excelXml(rows: unknown[][]) {
  const tableRows = rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`)
          .join("")}</Row>`
    )
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="clients">
    <Table>${tableRows}</Table>
  </Worksheet>
</Workbook>`;
}

reportsRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const companyWhere = scopedCompanyWhere(req);
    const clients = await prisma.client.count({ where: { ...companyWhere, status: "ACTIVE" } });
    const promoters = await prisma.promoter.count({ where: { ...companyWhere, status: "ACTIVE" } });
    const supervisors = await prisma.supervisor.count({ where: { ...companyWhere, status: "ACTIVE" } });
    const routes = await prisma.route.count({ where: companyWhere });
    const visits = await prisma.visit.groupBy({ by: ["status"], where: companyWhere, _count: { id: true } });
    const auditFlags = await prisma.auditFlag.count({ where: { resolved: false, visit: companyWhere } });
    const imports = await prisma.clientImportLog.findMany({ where: companyWhere, orderBy: { createdAt: "desc" }, take: 5 });

    res.json({
      data: {
        clients,
        promoters,
        supervisors,
        routes,
        auditFlags,
        visits: visits.reduce<Record<string, number>>((acc, item) => {
          acc[item.status] = item._count.id;
          return acc;
        }, {}),
        imports
      }
    });
  })
);

reportsRouter.get(
  "/visits.csv",
  asyncHandler(async (req, res) => {
    const visits = await prisma.visit.findMany({
      where: scopedCompanyWhere(req),
      include: { client: true, promoter: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      take: 1000
    });

    const rows = [
      ["id", "client", "promoter", "status", "started_at", "finished_at"],
      ...visits.map((visit) => [
        visit.id,
        visit.client.name,
        visit.promoter?.user.name ?? "",
        visit.status,
        visit.startedAt?.toISOString() ?? "",
        visit.finishedAt?.toISOString() ?? ""
      ])
    ];

    res.header("content-type", "text/csv; charset=utf-8");
    res.attachment("visits.csv");
    res.send(rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n"));
  })
);

reportsRouter.get(
  "/clients.xls",
  asyncHandler(async (req, res) => {
    const clients = await prisma.client.findMany({ where: scopedCompanyWhere(req), orderBy: { createdAt: "desc" }, take: 1000 });
    const workbook = excelXml([
      ["code", "name", "document", "status", "city", "state"],
      ...clients.map((client) => [
        client.code ?? "",
        client.name,
        client.document ?? "",
        client.status,
        client.city ?? "",
        client.state ?? ""
      ])
    ]);

    res.header("content-type", "application/vnd.ms-excel; charset=utf-8");
    res.attachment("clients.xls");
    res.send(workbook);
  })
);

reportsRouter.get(
  "/clients.xlsx",
  asyncHandler(async (req, res) => {
    const clients = await prisma.client.findMany({ where: scopedCompanyWhere(req), orderBy: { createdAt: "desc" }, take: 1000 });
    const workbook = excelXml([
      [
        "code",
        "name",
        "document",
        "status",
        "city",
        "state"
      ],
      ...clients.map((client) => [
        client.code ?? "",
        client.name,
        client.document ?? "",
        client.status,
        client.city ?? "",
        client.state ?? ""
      ])
    ]);

    res.header("content-type", "application/vnd.ms-excel; charset=utf-8");
    res.attachment("clients.xls");
    res.send(workbook);
  })
);

reportsRouter.get(
  "/audit.pdf",
  asyncHandler(async (req, res) => {
    const flags = await prisma.auditFlag.findMany({
      where: { visit: scopedCompanyWhere(req) },
      include: { visit: { include: { client: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    const doc = new PDFDocument({ margin: 48 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => {
      res.header("content-type", "application/pdf");
      res.attachment("audit.pdf");
      res.send(Buffer.concat(chunks));
    });

    doc.fontSize(18).text("Sales Promoters - Auditoria");
    doc.moveDown();

    for (const flag of flags) {
      doc.fontSize(11).text(`${flag.severity} - ${flag.type} - ${flag.visit.client.name}`);
      doc.fontSize(9).fillColor("gray").text(flag.createdAt.toISOString()).fillColor("black");
      doc.moveDown(0.5);
    }

    doc.end();
  })
);

import { Router } from "express";
import PDFDocument from "pdfkit";
import writeXlsxFile from "write-excel-file/node";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";

export const reportsRouter = Router();

reportsRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const [clients, promoters, supervisors, routes, visits, auditFlags, imports] = await Promise.all([
      prisma.client.count({ where: { status: "ACTIVE" } }),
      prisma.promoter.count({ where: { status: "ACTIVE" } }),
      prisma.supervisor.count({ where: { status: "ACTIVE" } }),
      prisma.route.count(),
      prisma.visit.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.auditFlag.count({ where: { resolved: false } }),
      prisma.clientImportLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 })
    ]);

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
  asyncHandler(async (_req, res) => {
    const visits = await prisma.visit.findMany({
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
  "/clients.xlsx",
  asyncHandler(async (_req, res) => {
    const clients = await prisma.client.findMany({ orderBy: { createdAt: "desc" }, take: 1000 });
    const buffer = await writeXlsxFile([
      [
        { value: "code", fontWeight: "bold" },
        { value: "name", fontWeight: "bold" },
        { value: "document", fontWeight: "bold" },
        { value: "status", fontWeight: "bold" },
        { value: "city", fontWeight: "bold" },
        { value: "state", fontWeight: "bold" }
      ],
      ...clients.map((client) => [
        { value: client.code ?? "" },
        { value: client.name },
        { value: client.document ?? "" },
        { value: client.status },
        { value: client.city ?? "" },
        { value: client.state ?? "" }
      ])
    ]).toBuffer();

    res.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.attachment("clients.xlsx");
    res.send(Buffer.from(buffer));
  })
);

reportsRouter.get(
  "/audit.pdf",
  asyncHandler(async (_req, res) => {
    const flags = await prisma.auditFlag.findMany({
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

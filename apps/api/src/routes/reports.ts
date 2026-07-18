import { Router } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { scopedCompanyWhere } from "../lib/tenant";
import { buildRouteWindowWhere, endOfDay, startOfDay } from "../lib/route-window";
import { summarizeRouteProgress } from "../services/route-status";

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

const productivityQuerySchema = z.object({
  startDate: z.string().datetime().or(z.string().date()).optional(),
  endDate: z.string().datetime().or(z.string().date()).optional()
});

function minutesBetween(start?: Date | null, end?: Date | null) {
  if (!start || !end) {
    return null;
  }

  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return minutes >= 0 ? minutes : 0;
}

function average(total: number, count: number) {
  return count > 0 ? Math.round(total / count) : 0;
}

function clientDisplayName(client: { name: string; tradeName?: string | null }) {
  const tradeName = client.tradeName?.trim();
  return tradeName && tradeName !== client.name ? `${client.name} | Fantasia: ${tradeName}` : client.name;
}

async function buildProductivityReport(req: Parameters<typeof scopedCompanyWhere>[0]) {
  const input = productivityQuerySchema.parse(req.query);
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setDate(now.getDate() - 30);

  const startDate = input.startDate ? startOfDay(new Date(input.startDate)) : startOfDay(defaultStart);
  const endDate = input.endDate ? endOfDay(new Date(input.endDate)) : endOfDay(now);
  const where: Prisma.VisitWhereInput = {
    ...scopedCompanyWhere(req),
    startedAt: {
      gte: startDate,
      lte: endDate
    }
  };

  const visits = await prisma.visit.findMany({
    where,
    include: {
      client: true,
      promoter: { include: { user: true } },
      route: true,
      photos: true,
      auditFlags: true,
      supplierExecutions: {
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              tradeName: true
            }
          }
        }
      }
    },
    orderBy: [
      { promoterId: "asc" },
      { startedAt: "asc" },
      { createdAt: "asc" }
    ]
  });

  const previousByPromoter = new Map<string, (typeof visits)[number]>();
  const summaryByPromoter = new Map<
    string,
    {
      promoterId: string | null;
      promoterCode: number | null;
      promoterName: string;
      visits: number;
      completedVisits: number;
      serviceMinutesTotal: number;
      serviceCount: number;
      travelMinutesTotal: number;
      travelCount: number;
      photoCount: number;
      auditFlags: number;
      supplierExecutions: number;
      noDeliveryCount: number;
      stockoutCount: number;
      firstStartAt: string | null;
      lastFinishAt: string | null;
    }
  >();
  const summaryBySupplier = new Map<
    string,
    {
      supplierId: string;
      supplierName: string;
      executions: number;
      noDeliveryCount: number;
      stockoutCount: number;
      notesCount: number;
    }
  >();

  const rows = visits.map((visit) => {
    const promoterKey = visit.promoterId ?? "sem-promotor";
    const previousVisit = previousByPromoter.get(promoterKey);
    const serviceMinutes = minutesBetween(visit.startedAt, visit.finishedAt);
    const travelMinutes = minutesBetween(previousVisit?.finishedAt, visit.startedAt);
    const promoterName = visit.promoter?.user.name ?? "Sem promotor";
    const promoterCode = visit.promoter?.code ?? null;
    const summary = summaryByPromoter.get(promoterKey) ?? {
      promoterId: visit.promoterId,
      promoterCode,
      promoterName,
      visits: 0,
      completedVisits: 0,
      serviceMinutesTotal: 0,
      serviceCount: 0,
      travelMinutesTotal: 0,
      travelCount: 0,
      photoCount: 0,
      auditFlags: 0,
      supplierExecutions: 0,
      noDeliveryCount: 0,
      stockoutCount: 0,
      firstStartAt: null,
      lastFinishAt: null
    };

    summary.visits += 1;
    summary.completedVisits += visit.status === "completed" ? 1 : 0;

    if (serviceMinutes !== null) {
      summary.serviceMinutesTotal += serviceMinutes;
      summary.serviceCount += 1;
    }

    if (travelMinutes !== null && previousVisit?.finishedAt) {
      summary.travelMinutesTotal += travelMinutes;
      summary.travelCount += 1;
    }

    summary.firstStartAt ??= visit.startedAt?.toISOString() ?? null;

    if (visit.finishedAt) {
      summary.lastFinishAt = visit.finishedAt.toISOString();
    }

    summary.photoCount += visit.photos.length;
    summary.auditFlags += visit.auditFlags.length;
    summary.supplierExecutions += visit.supplierExecutions.length;
    summary.noDeliveryCount += visit.supplierExecutions.filter((execution) => execution.deliveryReceived === false).length;
    summary.stockoutCount += visit.supplierExecutions.filter((execution) => execution.stockoutFound === true).length;

    for (const execution of visit.supplierExecutions) {
      const supplierName = execution.supplier.tradeName ?? execution.supplier.name;
      const supplierSummary = summaryBySupplier.get(execution.supplierId) ?? {
        supplierId: execution.supplierId,
        supplierName,
        executions: 0,
        noDeliveryCount: 0,
        stockoutCount: 0,
        notesCount: 0
      };

      supplierSummary.executions += 1;
      supplierSummary.noDeliveryCount += execution.deliveryReceived === false ? 1 : 0;
      supplierSummary.stockoutCount += execution.stockoutFound === true ? 1 : 0;
      supplierSummary.notesCount += execution.notes?.trim() ? 1 : 0;
      summaryBySupplier.set(execution.supplierId, supplierSummary);
    }

    summaryByPromoter.set(promoterKey, summary);
    previousByPromoter.set(promoterKey, visit);
    const visitNoDeliveryCount = visit.supplierExecutions.filter((execution) => execution.deliveryReceived === false).length;
    const visitStockoutCount = visit.supplierExecutions.filter((execution) => execution.stockoutFound === true).length;

    return {
      visitId: visit.id,
      promoterId: visit.promoterId,
      promoterCode,
      promoterName,
      clientId: visit.clientId,
      clientCode: visit.client.code,
      clientName: clientDisplayName(visit.client),
      routeName: visit.route?.name ?? null,
      status: visit.status,
      startedAt: visit.startedAt?.toISOString() ?? null,
      finishedAt: visit.finishedAt?.toISOString() ?? null,
      serviceMinutes,
      previousClientName: previousVisit ? clientDisplayName(previousVisit.client) : null,
      travelFromPreviousMinutes: previousVisit?.finishedAt ? travelMinutes : null,
      photoCount: visit.photos.length,
      supplierExecutions: visit.supplierExecutions.length,
      noDeliveryCount: visitNoDeliveryCount,
      stockoutCount: visitStockoutCount,
      auditFlags: visit.auditFlags.length
    };
  });

  const promoters = Array.from(summaryByPromoter.values()).map((item) => ({
    ...item,
      averageServiceMinutes: average(item.serviceMinutesTotal, item.serviceCount),
      averageTravelMinutes: average(item.travelMinutesTotal, item.travelCount)
  }));
  const suppliers = Array.from(summaryBySupplier.values()).sort((first, second) => {
    const secondAttention = second.noDeliveryCount + second.stockoutCount;
    const firstAttention = first.noDeliveryCount + first.stockoutCount;

    if (secondAttention !== firstAttention) {
      return secondAttention - firstAttention;
    }

    return second.executions - first.executions;
  });

  return {
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    },
    totals: {
      promoters: promoters.length,
      visits: rows.length,
      completedVisits: rows.filter((row) => row.status === "completed").length,
      photoCount: rows.reduce((total, row) => total + row.photoCount, 0),
      visitsWithEvidence: rows.filter((row) => row.photoCount > 0).length,
      supplierExecutions: rows.reduce((total, row) => total + row.supplierExecutions, 0),
      noDeliveryCount: rows.reduce((total, row) => total + row.noDeliveryCount, 0),
      stockoutCount: rows.reduce((total, row) => total + row.stockoutCount, 0),
      auditFlags: rows.reduce((total, row) => total + row.auditFlags, 0),
      serviceMinutesTotal: promoters.reduce((total, item) => total + item.serviceMinutesTotal, 0),
      travelMinutesTotal: promoters.reduce((total, item) => total + item.travelMinutesTotal, 0),
      averageServiceMinutes: average(
        promoters.reduce((total, item) => total + item.serviceMinutesTotal, 0),
        promoters.reduce((total, item) => total + item.serviceCount, 0)
      ),
      averageTravelMinutes: average(
        promoters.reduce((total, item) => total + item.travelMinutesTotal, 0),
        promoters.reduce((total, item) => total + item.travelCount, 0)
      )
    },
    promoters,
    suppliers,
    visits: rows
  };
}

reportsRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const companyWhere = scopedCompanyWhere(req);
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const routeWindowWhere = buildRouteWindowWhere(todayStart, todayEnd);
    const todayRouteWhere: Prisma.RouteWhereInput = {
      ...companyWhere,
      status: { in: ["PUBLISHED", "COMPLETED", "CANCELLED"] },
      ...routeWindowWhere
    };

    const [clients, promoters, supervisors, routesToday, auditFlags, imports, routesTotal, checkinsToday] =
      await Promise.all([
      prisma.client.count({ where: { ...companyWhere, status: "ACTIVE" } }),
      prisma.promoter.count({ where: { ...companyWhere, status: "ACTIVE" } }),
      prisma.supervisor.count({ where: { ...companyWhere, status: "ACTIVE" } }),
      prisma.route.findMany({
        where: {
          ...todayRouteWhere
        },
        select: {
          id: true,
          status: true,
          scheduledDate: true,
          startDate: true,
          endDate: true,
          items: {
            where: {
              status: { not: "CANCELLED" }
            },
            select: {
              status: true,
              visits: {
                select: {
                  status: true
                }
              }
            }
          }
        }
      }),
      prisma.auditFlag.count({ where: { resolved: false, visit: companyWhere } }),
      prisma.clientImportLog.findMany({ where: companyWhere, orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.route.count({ where: companyWhere }),
      prisma.visitPhoto.count({
        where: {
          type: "checkin",
          visit: {
            ...companyWhere,
            OR: [
              {
                startedAt: {
                  gte: todayStart,
                  lte: todayEnd
                }
              },
              {
                startedAt: null,
                createdAt: {
                  gte: todayStart,
                  lte: todayEnd
                }
              }
            ]
          }
        }
      })
    ]);

    const routeSummaries = routesToday.map((route) => summarizeRouteProgress(route, now));
    const routesPublished = routeSummaries.filter(
      (route) => route.operationalStatus === "PUBLISHED" || route.operationalStatus === "IN_PROGRESS"
    ).length;
    const routesInProgress = routeSummaries.filter((route) => route.operationalStatus === "IN_PROGRESS").length;
    const routesCompleted = routeSummaries.filter((route) => route.operationalStatus === "COMPLETED").length;
    const routesNotCompleted = routeSummaries.filter((route) => route.operationalStatus === "NOT_COMPLETED").length;
    const routeItemsToday = routeSummaries.reduce((total, route) => total + route.totalItems, 0);
    const completedVisitsToday = routeSummaries.reduce((total, route) => total + route.completedItems, 0);
    const inProgressVisitsToday = routeSummaries.reduce((total, route) => total + route.inProgressItems, 0);
    const notCompletedVisitsToday = routeSummaries.reduce((total, route) => total + route.resolvedWithoutCompletionItems, 0);
    const plannedVisitsToday = routeSummaries.reduce((total, route) => total + route.plannedItems, 0);
    const pendingVisitsToday = routeSummaries.reduce(
      (total, route) => total + (route.isExpired ? route.unresolvedItems : 0),
      0
    );
    res.json({
      data: {
        clients,
        promoters,
        supervisors,
        routes: routesPublished,
        routesInProgress,
        routesCompleted,
        routesNotCompleted,
        auditFlags,
        routeItemsToday,
        todayWindow: {
          startDate: todayStart.toISOString(),
          endDate: todayEnd.toISOString()
        },
        visits: {
          completed: completedVisitsToday,
          in_progress: inProgressVisitsToday,
          not_completed: notCompletedVisitsToday,
          planned: plannedVisitsToday,
          pending: pendingVisitsToday
        },
        visitsToday: {
          completed: completedVisitsToday,
          in_progress: inProgressVisitsToday,
          not_completed: notCompletedVisitsToday,
          planned: plannedVisitsToday,
          pending: pendingVisitsToday
        },
        checkinsToday,
        routesTotal,
        imports
      }
    });
  })
);

reportsRouter.get(
  "/productivity",
  asyncHandler(async (req, res) => {
    const report = await buildProductivityReport(req);
    res.json({ data: report });
  })
);

reportsRouter.get(
  "/productivity.csv",
  asyncHandler(async (req, res) => {
    const report = await buildProductivityReport(req);
    const rows = [
      [
        "promotor_codigo",
        "promotor",
        "cliente_codigo",
        "cliente",
        "rota",
        "status",
        "inicio",
        "fim",
        "minutos_no_cliente",
        "cliente_anterior",
        "minutos_deslocamento",
        "fotos",
        "fornecedores_executados",
        "sem_entrega",
        "ruptura",
        "auditorias"
      ],
      ...report.visits.map((visit) => [
        visit.promoterCode ? `PRO-${String(visit.promoterCode).padStart(4, "0")}` : "",
        visit.promoterName,
        visit.clientCode ?? "",
        visit.clientName,
        visit.routeName ?? "",
        visit.status,
        visit.startedAt ?? "",
        visit.finishedAt ?? "",
        visit.serviceMinutes ?? "",
        visit.previousClientName ?? "",
        visit.travelFromPreviousMinutes ?? "",
        visit.photoCount,
        visit.supplierExecutions,
        visit.noDeliveryCount,
        visit.stockoutCount,
        visit.auditFlags
      ])
    ];

    res.header("content-type", "text/csv; charset=utf-8");
    res.attachment("produtividade-promotores.csv");
    res.send(rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n"));
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
      ["code", "name", "tradeName", "document", "status", "city", "state"],
      ...clients.map((client) => [
        client.code ?? "",
        client.name,
        client.tradeName ?? "",
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
        "tradeName",
        "document",
        "status",
        "city",
        "state"
      ],
      ...clients.map((client) => [
        client.code ?? "",
        client.name,
        client.tradeName ?? "",
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

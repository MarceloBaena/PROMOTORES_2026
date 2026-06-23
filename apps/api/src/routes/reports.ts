import { Router } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
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

const productivityQuerySchema = z.object({
  startDate: z.string().datetime().or(z.string().date()).optional(),
  endDate: z.string().datetime().or(z.string().date()).optional()
});

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function zonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second")
  };
}

function zonedDateTimeToUtc(
  timeZone: string,
  parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number; millisecond?: number }
) {
  const desiredUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    parts.millisecond ?? 0
  );
  const guessedParts = zonedDateParts(new Date(desiredUtc), timeZone);
  const guessedUtc = Date.UTC(
    guessedParts.year,
    guessedParts.month - 1,
    guessedParts.day,
    guessedParts.hour,
    guessedParts.minute,
    guessedParts.second
  );

  return new Date(desiredUtc + (desiredUtc - guessedUtc));
}

function businessTodayRange(timeZone = "America/Cuiaba") {
  const today = zonedDateParts(new Date(), timeZone);
  const start = zonedDateTimeToUtc(timeZone, {
    year: today.year,
    month: today.month,
    day: today.day
  });
  const nextDayStart = zonedDateTimeToUtc(timeZone, {
    year: today.year,
    month: today.month,
    day: today.day + 1
  });

  return {
    start,
    end: new Date(nextDayStart.getTime() - 1),
    timeZone
  };
}

function countByStatus<T extends string>(items: Array<{ status: T; _count: { id: number } }>) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count.id;
    return acc;
  }, {});
}

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
      route: true
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
      firstStartAt: string | null;
      lastFinishAt: string | null;
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

    summaryByPromoter.set(promoterKey, summary);
    previousByPromoter.set(promoterKey, visit);

    return {
      visitId: visit.id,
      promoterId: visit.promoterId,
      promoterCode,
      promoterName,
      clientId: visit.clientId,
      clientCode: visit.client.code,
      clientName: visit.client.name,
      routeName: visit.route?.name ?? null,
      status: visit.status,
      startedAt: visit.startedAt?.toISOString() ?? null,
      finishedAt: visit.finishedAt?.toISOString() ?? null,
      serviceMinutes,
      previousClientName: previousVisit?.client.name ?? null,
      travelFromPreviousMinutes: previousVisit?.finishedAt ? travelMinutes : null
    };
  });

  const promoters = Array.from(summaryByPromoter.values()).map((item) => ({
    ...item,
    averageServiceMinutes: average(item.serviceMinutesTotal, item.serviceCount),
    averageTravelMinutes: average(item.travelMinutesTotal, item.travelCount)
  }));

  return {
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    },
    totals: {
      promoters: promoters.length,
      visits: rows.length,
      completedVisits: rows.filter((row) => row.status === "completed").length,
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
    visits: rows
  };
}

reportsRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const companyWhere = scopedCompanyWhere(req);
    const today = businessTodayRange();
    const todayRouteWhere: Prisma.RouteWhereInput = {
      ...companyWhere,
      scheduledDate: {
        gte: today.start,
        lte: today.end
      }
    };
    const todayVisitWhere: Prisma.VisitWhereInput = {
      ...companyWhere,
      OR: [
        {
          startedAt: {
            gte: today.start,
            lte: today.end
          }
        },
        {
          startedAt: null,
          createdAt: {
            gte: today.start,
            lte: today.end
          }
        }
      ]
    };
    const clients = await prisma.client.count({ where: { ...companyWhere, status: "ACTIVE" } });
    const promoters = await prisma.promoter.count({ where: { ...companyWhere, status: "ACTIVE" } });
    const supervisors = await prisma.supervisor.count({ where: { ...companyWhere, status: "ACTIVE" } });
    const routes = await prisma.route.count({ where: companyWhere });
    const routesToday = await prisma.route.groupBy({ by: ["status"], where: todayRouteWhere, _count: { id: true } });
    const visits = await prisma.visit.groupBy({ by: ["status"], where: companyWhere, _count: { id: true } });
    const visitsToday = await prisma.visit.groupBy({ by: ["status"], where: todayVisitWhere, _count: { id: true } });
    const checkinsToday = await prisma.visitPhoto.count({ where: { type: "checkin", visit: todayVisitWhere } });
    const auditFlags = await prisma.auditFlag.count({ where: { resolved: false, visit: companyWhere } });
    const imports = await prisma.clientImportLog.findMany({ where: companyWhere, orderBy: { createdAt: "desc" }, take: 5 });
    const routeStatusToday = countByStatus(routesToday);
    const visitStatusToday = countByStatus(visitsToday);

    res.json({
      data: {
        clients,
        promoters,
        supervisors,
        routes,
        routesToday: {
          planned: (routeStatusToday.DRAFT ?? 0) + (routeStatusToday.PUBLISHED ?? 0),
          inProgress: visitStatusToday.in_progress ?? 0,
          completed: routeStatusToday.COMPLETED ?? 0,
          cancelled: routeStatusToday.CANCELLED ?? 0,
          total: routesToday.reduce((total, item) => total + item._count.id, 0),
          date: today.start.toISOString(),
          timeZone: today.timeZone
        },
        auditFlags,
        visits: countByStatus(visits),
        visitsToday: visitStatusToday,
        checkinsToday,
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
        "minutos_deslocamento"
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
        visit.travelFromPreviousMinutes ?? ""
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

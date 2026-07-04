import type { Prisma } from "@prisma/client";

export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function buildRouteWindowWhere(start: Date, end: Date): Prisma.RouteWhereInput {
  return {
    OR: [
      {
        AND: [
          { startDate: { not: null } },
          { endDate: { not: null } },
          { startDate: { lte: end } },
          { endDate: { gte: start } }
        ]
      },
      {
        AND: [
          { startDate: null },
          { endDate: null },
          { scheduledDate: { gte: start, lte: end } }
        ]
      }
    ]
  };
}

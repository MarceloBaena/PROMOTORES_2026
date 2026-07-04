import type { RouteItemStatus, RouteStatus, VisitStatus } from "@prisma/client";

type VisitLike = {
  status?: VisitStatus | string | null;
};

type RouteItemLike = {
  status?: RouteItemStatus | string | null;
  visits?: VisitLike[] | null;
};

type RouteLike = {
  status?: RouteStatus | string | null;
  scheduledDate?: Date | string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  items?: RouteItemLike[] | null;
};

export type OperationalRouteStatus = RouteStatus | "NOT_COMPLETED" | "IN_PROGRESS";

export interface RouteProgressSummary {
  totalItems: number;
  completedItems: number;
  resolvedWithoutCompletionItems: number;
  unresolvedItems: number;
  inProgressItems: number;
  plannedItems: number;
  operationalStatus: OperationalRouteStatus;
  isExpired: boolean;
}

function toDate(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function isCompletedItem(item: RouteItemLike) {
  if (item.status === "COMPLETED") {
    return true;
  }

  return (item.visits ?? []).some((visit) => visit.status === "completed");
}

function isResolvedWithoutCompletionItem(item: RouteItemLike) {
  if (item.status === "SKIPPED" || item.status === "CANCELLED") {
    return true;
  }

  return (item.visits ?? []).some((visit) => visit.status === "not_completed" || visit.status === "canceled");
}

function isInProgressItem(item: RouteItemLike) {
  return (item.visits ?? []).some((visit) => visit.status === "in_progress");
}

export function summarizeRouteProgress(route: RouteLike, now = new Date()): RouteProgressSummary {
  const items = route.items ?? [];
  const totalItems = items.length;
  const completedItems = items.filter(isCompletedItem).length;
  const resolvedWithoutCompletionItems = items.filter(
    (item) => !isCompletedItem(item) && isResolvedWithoutCompletionItem(item)
  ).length;
  const inProgressItems = items.filter(
    (item) => !isCompletedItem(item) && !isResolvedWithoutCompletionItem(item) && isInProgressItem(item)
  ).length;
  const unresolvedItems = Math.max(totalItems - completedItems - resolvedWithoutCompletionItems, 0);
  const plannedItems = Math.max(unresolvedItems - inProgressItems, 0);

  const endDate = toDate(route.endDate) ?? toDate(route.startDate) ?? toDate(route.scheduledDate);
  const isExpired = Boolean(endDate && endDate.getTime() < now.getTime());
  const allCompleted = totalItems > 0 && completedItems === totalItems;
  const allResolved = totalItems > 0 && completedItems + resolvedWithoutCompletionItems === totalItems;

  let operationalStatus: OperationalRouteStatus;

  if (route.status === "DRAFT") {
    operationalStatus = "DRAFT";
  } else if (allCompleted || route.status === "COMPLETED") {
    operationalStatus = "COMPLETED";
  } else if (allResolved || isExpired) {
    operationalStatus = "NOT_COMPLETED";
  } else if (inProgressItems > 0) {
    operationalStatus = "IN_PROGRESS";
  } else if (route.status === "CANCELLED") {
    operationalStatus = "CANCELLED";
  } else {
    operationalStatus = "PUBLISHED";
  }

  return {
    totalItems,
    completedItems,
    resolvedWithoutCompletionItems,
    unresolvedItems,
    inProgressItems,
    plannedItems,
    operationalStatus,
    isExpired
  };
}

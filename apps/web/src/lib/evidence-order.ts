export interface EvidenceOrderItem {
  id?: string | null;
  type?: string | null;
  createdAt?: string | Date | null;
  capturedAt?: string | Date | null;
  supplierId?: string | null;
  supplierExecutionId?: string | null;
  supplierName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  activityId?: string | null;
  activityName?: string | null;
  metadata?: {
    categoryId?: string | null;
    categoryName?: string | null;
    activityId?: string | null;
    activityName?: string | null;
  } | null;
  supplier?: { name?: string | null; tradeName?: string | null } | null;
  supplierExecution?: {
    id?: string | null;
    supplierId?: string | null;
    supplier?: { name?: string | null; tradeName?: string | null } | null;
  } | null;
}

const VISIT_LEVEL_ORDER = new Map<string, number>([
  ["checkin", 0],
  ["before", 1],
  ["after", 2],
  ["checkout", 98],
]);

const SUPPLIER_LEVEL_ORDER = new Map<string, number>([
  ["supplier_before", 10],
  ["category", 20],
  ["activity", 30],
  ["supplier_after", 40],
]);

function text(value?: string | null) {
  return value?.trim() || "";
}

function timestamp(value?: string | Date | null) {
  if (!value) {
    return 0;
  }

  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function supplierName(item: EvidenceOrderItem) {
  return (
    text(item.supplierName) ||
    text(item.supplier?.tradeName) ||
    text(item.supplier?.name) ||
    text(item.supplierExecution?.supplier?.tradeName) ||
    text(item.supplierExecution?.supplier?.name)
  );
}

function supplierKey(item: EvidenceOrderItem) {
  return (
    text(item.supplierExecutionId) ||
    text(item.supplierExecution?.id) ||
    text(item.supplierId) ||
    text(item.supplierExecution?.supplierId) ||
    supplierName(item)
  );
}

function categoryKey(item: EvidenceOrderItem) {
  return text(item.categoryId) || text(item.metadata?.categoryId) || text(item.categoryName) || text(item.metadata?.categoryName);
}

function activityKey(item: EvidenceOrderItem) {
  return text(item.activityId) || text(item.metadata?.activityId) || text(item.activityName) || text(item.metadata?.activityName);
}

function evidenceBucket(item: EvidenceOrderItem) {
  if (categoryKey(item)) {
    return "category";
  }

  if (activityKey(item)) {
    return "activity";
  }

  return text(item.type) || "other";
}

function bucketOrder(item: EvidenceOrderItem) {
  const bucket = evidenceBucket(item);
  const hasSupplier = Boolean(supplierKey(item));

  if (hasSupplier) {
    return SUPPLIER_LEVEL_ORDER.get(bucket) ?? 90;
  }

  return VISIT_LEVEL_ORDER.get(bucket) ?? 80;
}

function visitGroupOrder(item: EvidenceOrderItem) {
  const hasSupplier = Boolean(supplierKey(item));
  const type = text(item.type);

  if (!hasSupplier && type === "checkin") {
    return 0;
  }

  if (!hasSupplier && (type === "before" || type === "after")) {
    return 1;
  }

  if (hasSupplier) {
    return 2;
  }

  if (!hasSupplier && type === "checkout") {
    return 3;
  }

  return 4;
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortVisitEvidence<T extends EvidenceOrderItem>(items: T[]) {
  return [...items].sort((left, right) => {
    const groupDiff = visitGroupOrder(left) - visitGroupOrder(right);
    if (groupDiff !== 0) return groupDiff;

    const supplierDiff = compareText(supplierKey(left), supplierKey(right));
    if (supplierDiff !== 0) return supplierDiff;

    const bucketDiff = bucketOrder(left) - bucketOrder(right);
    if (bucketDiff !== 0) return bucketDiff;

    const categoryDiff = compareText(categoryKey(left), categoryKey(right));
    if (categoryDiff !== 0) return categoryDiff;

    const activityDiff = compareText(activityKey(left), activityKey(right));
    if (activityDiff !== 0) return activityDiff;

    return timestamp(left.capturedAt ?? left.createdAt) - timestamp(right.capturedAt ?? right.createdAt);
  });
}

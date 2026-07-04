import type { AuditFlagType, AuditSeverity, Prisma, SupplierExecution } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

const REQUIRED_VISIT_PHOTO_TYPES = ["checkin", "checkout"] as const;
const LEGACY_REQUIRED_PHOTO_TYPES = ["checkin", "before", "after", "checkout"] as const;
const SUPPLIER_BEFORE_PHOTO_TYPES = new Set(["supplier_before", "before"]);
const SUPPLIER_AFTER_PHOTO_TYPES = new Set(["supplier_after", "after"]);
const AUTO_AUDIT_TYPES: AuditFlagType[] = [
  "GPS_MISSING",
  "OUTSIDE_GEOFENCE",
  "MISSING_REQUIRED_PHOTO",
  "SUPPLIER_MISSING_BEFORE_PHOTO",
  "SUPPLIER_MISSING_AFTER_PHOTO",
  "SUPPLIER_MISSING_DELIVERY_RESPONSE",
  "SUPPLIER_MISSING_REPLENISHMENT_RESPONSE",
  "SUPPLIER_MISSING_STOCKOUT_RESPONSE",
  "SUPPLIER_TOO_FAST",
  "CHECKOUT_WITH_PENDING_SUPPLIER",
  "TOO_FAST_VISIT",
  "TOO_LONG_VISIT",
  "INCONSISTENT_FINISH",
  "POSSIBLE_DUPLICATE_PHOTO"
];
const MIN_VISIT_MINUTES = Number(process.env.AUDIT_MIN_VISIT_MINUTES ?? 5);
const MAX_VISIT_MINUTES = Number(process.env.AUDIT_MAX_VISIT_MINUTES ?? 480);
const MIN_SUPPLIER_EXECUTION_MINUTES = Number(process.env.AUDIT_MIN_SUPPLIER_EXECUTION_MINUTES ?? 2);

type AuditCandidate = {
  type: AuditFlagType;
  severity: AuditSeverity;
  description: string;
  details: Prisma.InputJsonObject;
};

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function minutesBetween(start?: Date | null, end?: Date | null) {
  if (!start || !end) {
    return null;
  }

  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function distanceMeters(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const startLatitude = toRadians(from.latitude);
  const endLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function photoGps(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const latitude = toNumber(metadata.gpsLatitude);
  const longitude = toNumber(metadata.gpsLongitude);

  return latitude !== null && longitude !== null ? { latitude, longitude } : null;
}

function buildFlag(
  type: AuditFlagType,
  severity: AuditSeverity,
  description: string,
  details: Prisma.InputJsonObject
): AuditCandidate {
  return {
    type,
    severity,
    description,
    details: {
      ...details,
      source: "automatic",
      generatedAt: new Date().toISOString()
    }
  };
}

function executionDurationMinutes(execution: Pick<SupplierExecution, "startedAtDevice" | "finishedAtDevice">) {
  return minutesBetween(execution.startedAtDevice, execution.finishedAtDevice);
}

function supplierExecutionRequiresDeliveryFlow(deliveryReceived: boolean | null | undefined) {
  return deliveryReceived !== false;
}

export async function evaluateVisitAudit(visitId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      client: true,
      photos: { orderBy: { createdAt: "asc" } },
      supplierExecutions: {
        orderBy: { createdAt: "asc" },
        include: {
          supplier: true,
          photos: { orderBy: { createdAt: "asc" } }
        }
      }
    }
  });

  if (!visit) {
    logger.warn({ visitId }, "audit evaluation skipped because visit was not found");
    return [];
  }

  const flags: AuditCandidate[] = [];
  const photoTypes = new Set(visit.photos.map((photo) => photo.type));
  const missingVisitPhotoTypes = REQUIRED_VISIT_PHOTO_TYPES.filter((type) => !photoTypes.has(type));
  const missingLegacyPhotoTypes = LEGACY_REQUIRED_PHOTO_TYPES.filter((type) => !photoTypes.has(type));
  const visitLatitude = toNumber(visit.gpsLatitude);
  const visitLongitude = toNumber(visit.gpsLongitude);
  const visitDurationMinutes = minutesBetween(visit.startedAt, visit.finishedAt);
  const requiredPhotoCounts = LEGACY_REQUIRED_PHOTO_TYPES.map((type) => ({
    type,
    count: visit.photos.filter((photo) => photo.type === type).length
  }));
  const completedSupplierExecutions = visit.supplierExecutions.filter((execution) => execution.status === "completed");
  const pendingSupplierExecutions = visit.supplierExecutions.filter((execution) => execution.status !== "completed");
  const supplierMissingBefore = completedSupplierExecutions.filter(
    (execution) =>
      supplierExecutionRequiresDeliveryFlow(execution.deliveryReceived) &&
      !execution.photos.some((photo) => SUPPLIER_BEFORE_PHOTO_TYPES.has(photo.type))
  );
  const supplierMissingAfter = completedSupplierExecutions.filter(
    (execution) =>
      supplierExecutionRequiresDeliveryFlow(execution.deliveryReceived) &&
      !execution.photos.some((photo) => SUPPLIER_AFTER_PHOTO_TYPES.has(photo.type))
  );
  const supplierMissingDelivery = completedSupplierExecutions.filter((execution) => execution.deliveryReceived === null || execution.deliveryReceived === undefined);
  const supplierMissingReplenishment = completedSupplierExecutions.filter(
    (execution) =>
      supplierExecutionRequiresDeliveryFlow(execution.deliveryReceived) &&
      (execution.productsReplenished === null || execution.productsReplenished === undefined)
  );
  const supplierMissingStockout = completedSupplierExecutions.filter(
    (execution) =>
      supplierExecutionRequiresDeliveryFlow(execution.deliveryReceived) &&
      (execution.stockoutFound === null || execution.stockoutFound === undefined)
  );
  const supplierTooFast = completedSupplierExecutions
    .map((execution) => ({ execution, minutes: executionDurationMinutes(execution) }))
    .filter((item) => item.minutes !== null && item.minutes >= 0 && item.minutes < MIN_SUPPLIER_EXECUTION_MINUTES);

  if (visit.status === "completed" && visit.supplierExecutions.length === 0 && missingLegacyPhotoTypes.length > 0) {
    flags.push(
      buildFlag("MISSING_REQUIRED_PHOTO", "HIGH", "Visita concluida sem todas as fotos obrigatorias.", {
        missingPhotoTypes: missingLegacyPhotoTypes
      })
    );
  }

  if (visit.status === "completed" && visit.supplierExecutions.length > 0 && missingVisitPhotoTypes.length > 0) {
    flags.push(
      buildFlag("MISSING_REQUIRED_PHOTO", "HIGH", "Visita concluida sem check-in e check-out obrigatorios.", {
        missingPhotoTypes: missingVisitPhotoTypes
      })
    );
  }

  if (visit.status === "completed" && supplierMissingBefore.length > 0) {
    flags.push(
      buildFlag("SUPPLIER_MISSING_BEFORE_PHOTO", "HIGH", "Fornecedor concluido sem foto antes.", {
        executions: supplierMissingBefore.map((execution) => ({
          supplierExecutionId: execution.id,
          supplierId: execution.supplierId,
          supplierName: execution.supplier.name
        }))
      })
    );
  }

  if (visit.status === "completed" && supplierMissingAfter.length > 0) {
    flags.push(
      buildFlag("SUPPLIER_MISSING_AFTER_PHOTO", "HIGH", "Fornecedor concluido sem foto depois.", {
        executions: supplierMissingAfter.map((execution) => ({
          supplierExecutionId: execution.id,
          supplierId: execution.supplierId,
          supplierName: execution.supplier.name
        }))
      })
    );
  }

  if (visit.status === "completed" && supplierMissingDelivery.length > 0) {
    flags.push(
      buildFlag("SUPPLIER_MISSING_DELIVERY_RESPONSE", "MEDIUM", "Fornecedor concluido sem resposta de entrega.", {
        executions: supplierMissingDelivery.map((execution) => ({
          supplierExecutionId: execution.id,
          supplierId: execution.supplierId,
          supplierName: execution.supplier.name
        }))
      })
    );
  }

  if (visit.status === "completed" && supplierMissingReplenishment.length > 0) {
    flags.push(
      buildFlag("SUPPLIER_MISSING_REPLENISHMENT_RESPONSE", "MEDIUM", "Fornecedor concluido sem resposta de abastecimento.", {
        executions: supplierMissingReplenishment.map((execution) => ({
          supplierExecutionId: execution.id,
          supplierId: execution.supplierId,
          supplierName: execution.supplier.name
        }))
      })
    );
  }

  if (visit.status === "completed" && supplierMissingStockout.length > 0) {
    flags.push(
      buildFlag("SUPPLIER_MISSING_STOCKOUT_RESPONSE", "MEDIUM", "Fornecedor concluido sem resposta de ruptura.", {
        executions: supplierMissingStockout.map((execution) => ({
          supplierExecutionId: execution.id,
          supplierId: execution.supplierId,
          supplierName: execution.supplier.name
        }))
      })
    );
  }

  if (visit.status === "completed" && supplierTooFast.length > 0) {
    flags.push(
      buildFlag("SUPPLIER_TOO_FAST", "MEDIUM", "Existe fornecedor concluido rapido demais para o padrao operacional.", {
        minSupplierExecutionMinutes: MIN_SUPPLIER_EXECUTION_MINUTES,
        executions: supplierTooFast.map((item) => ({
          supplierExecutionId: item.execution.id,
          supplierId: item.execution.supplierId,
          supplierName: item.execution.supplier.name,
          durationMinutes: item.minutes
        }))
      })
    );
  }

  if (visit.status === "completed" && pendingSupplierExecutions.length > 0) {
    flags.push(
      buildFlag("CHECKOUT_WITH_PENDING_SUPPLIER", "HIGH", "Checkout realizado com fornecedor pendente, pulado ou em andamento.", {
        executions: pendingSupplierExecutions.map((execution) => ({
          supplierExecutionId: execution.id,
          supplierId: execution.supplierId,
          supplierName: execution.supplier.name,
          status: execution.status
        }))
      })
    );
  }

  if (visit.status === "completed" && (!visit.startedAt || !visit.finishedAt || visitDurationMinutes === null || visitDurationMinutes < 0)) {
    flags.push(
      buildFlag("INCONSISTENT_FINISH", "HIGH", "Visita concluida com horarios inconsistentes.", {
        startedAt: visit.startedAt?.toISOString() ?? null,
        finishedAt: visit.finishedAt?.toISOString() ?? null
      })
    );
  }

  if (visitDurationMinutes !== null && visit.status === "completed" && visitDurationMinutes >= 0 && visitDurationMinutes < MIN_VISIT_MINUTES) {
    flags.push(
      buildFlag("TOO_FAST_VISIT", "MEDIUM", "Tempo de atendimento abaixo do minimo esperado.", {
        visitDurationMinutes,
        minVisitMinutes: MIN_VISIT_MINUTES
      })
    );
  }

  if (visitDurationMinutes !== null && visit.status === "completed" && visitDurationMinutes > MAX_VISIT_MINUTES) {
    flags.push(
      buildFlag("TOO_LONG_VISIT", "MEDIUM", "Tempo de atendimento acima do limite esperado.", {
        visitDurationMinutes,
        maxVisitMinutes: MAX_VISIT_MINUTES
      })
    );
  }

  if (visit.status === "completed") {
    const hasVisitGps = visitLatitude !== null && visitLongitude !== null;
    const hasPhotoGps = visit.photos.some((photo) => photoGps(photo.metadata));

    if (!hasVisitGps && !hasPhotoGps) {
      flags.push(
        buildFlag("GPS_MISSING", "MEDIUM", "Visita concluida sem coordenada GPS registrada.", {
          visitLatitude,
          visitLongitude,
          photosWithGps: visit.photos.filter((photo) => photoGps(photo.metadata)).length
        })
      );
    }
  }

  if (visitLatitude !== null && visitLongitude !== null && visit.client.latitude !== null && visit.client.longitude !== null) {
    const radiusMeters = visit.client.geofenceRadiusMeters;
    const distance = distanceMeters(
      { latitude: toNumber(visit.client.latitude) ?? 0, longitude: toNumber(visit.client.longitude) ?? 0 },
      { latitude: visitLatitude, longitude: visitLongitude }
    );

    if (distance > radiusMeters) {
      flags.push(
        buildFlag("OUTSIDE_GEOFENCE", "HIGH", "Check-in realizado fora do raio previsto para o cliente.", {
          distanceMeters: Math.round(distance),
          radiusMeters,
          clientLatitude: toNumber(visit.client.latitude),
          clientLongitude: toNumber(visit.client.longitude),
          visitLatitude,
          visitLongitude
        })
      );
    }
  }

  const duplicateRequiredPhotoTypes = requiredPhotoCounts.filter((item) => item.count > 1);

  if (duplicateRequiredPhotoTypes.length > 0) {
    flags.push(
      buildFlag("POSSIBLE_DUPLICATE_PHOTO", "LOW", "Mais de uma evidencia obrigatoria do mesmo tipo foi recebida.", {
        duplicatePhotoTypes: duplicateRequiredPhotoTypes
      })
    );
  }

  const existingFlags = await prisma.auditFlag.findMany({ where: { visitId } });
  const activeTypes = new Set(flags.map((flag) => flag.type));

  for (const flag of flags) {
    const existing = existingFlags.find((item) => item.type === flag.type);

    if (existing) {
      await prisma.auditFlag.update({
        where: { id: existing.id },
        data: {
          severity: flag.severity,
          description: flag.description,
          details: flag.details,
          resolved: false,
          resolvedById: null,
          resolvedAt: null,
          resolutionNote: null
        }
      });
      continue;
    }

    await prisma.auditFlag.create({
      data: {
        visitId,
        type: flag.type,
        severity: flag.severity,
        description: flag.description,
        details: flag.details
      }
    });
  }

  for (const existing of existingFlags) {
    if (!AUTO_AUDIT_TYPES.includes(existing.type) || activeTypes.has(existing.type) || existing.resolved) {
      continue;
    }

    await prisma.auditFlag.update({
      where: { id: existing.id },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolutionNote: "Resolvida automaticamente apos reconciliacao dos dados da visita."
      }
    });
  }

  logger.info({ visitId, flags: flags.map((flag) => flag.type) }, "visit audit evaluated");
  return flags;
}

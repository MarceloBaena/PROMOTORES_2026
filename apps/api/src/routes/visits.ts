import path from "node:path";
import { unlink } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { upload, publicUploadUrl } from "../services/uploads";
import { evaluateVisitAudit } from "../services/visit-audit";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { resolveCompanyId, requireCompanyId, scopedCompanyWhere, assertSameCompany } from "../lib/tenant";

export const visitsRouter = Router();

const requiredVisitPhotoTypes = ["checkin", "checkout"] as const;
const legacyRequiredPhotoTypes = ["checkin", "before", "after", "checkout"] as const;
const supplierBeforePhotoTypes = new Set(["supplier_before", "before"]);
const supplierAfterPhotoTypes = new Set(["supplier_after", "after"]);
const supplierPhotoTypes = [
  "supplier_before",
  "supplier_after",
  "leaflet",
  "gondola",
  "display",
  "island",
  "promotional_material",
  "checkout",
  "store_extra",
  "occurrence_extra"
] as const;
const acceptedPhotoTypes = ["checkin", ...legacyRequiredPhotoTypes.slice(1), ...supplierPhotoTypes] as const;

const optionalCoordinate = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z.coerce.number().min(min).max(max).optional()
  );

const visitSchema = z.object({
  clientGeneratedId: z.string().min(8).max(120).optional(),
  companyId: z.string().uuid().optional(),
  routeId: z.string().uuid().optional(),
  routeItemId: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  promoterId: z.string().uuid().optional(),
  status: z.enum(["pending", "in_progress", "completed", "not_completed", "canceled"]).optional(),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  gpsLatitude: optionalCoordinate(-90, 90),
  gpsLongitude: optionalCoordinate(-180, 180),
  notes: z.string().optional()
});

const photoSchema = z.object({
  type: z.enum(acceptedPhotoTypes).default("occurrence_extra"),
  clientGeneratedId: z.string().min(8).max(120).optional(),
  supplierExecutionId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  capturedAt: z.string().datetime().optional(),
  gpsLatitude: optionalCoordinate(-90, 90),
  gpsLongitude: optionalCoordinate(-180, 180)
});

const base64PhotoSchema = photoSchema.extend({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
  base64Image: z.string().min(100)
});

type SanitizedVisitInput = Omit<z.infer<typeof visitSchema>, "routeId" | "routeItemId"> & {
  routeId?: string | null;
  routeItemId?: string | null;
};

type SanitizedVisitUpdateInput = Omit<Partial<z.infer<typeof visitSchema>>, "routeId" | "routeItemId"> & {
  routeId?: string | null;
  routeItemId?: string | null;
};

const supplierExecutionSchema = z.object({
  clientGeneratedId: z.string().min(8).max(120).optional(),
  supplierId: z.string().uuid(),
  status: z.enum(["pending", "in_progress", "completed", "skipped"]).optional(),
  deliveryReceived: z.boolean().nullable().optional(),
  productsReplenished: z.boolean().nullable().optional(),
  stockoutFound: z.boolean().nullable().optional(),
  notes: z.string().optional(),
  startedAtDevice: z.string().datetime().optional(),
  finishedAtDevice: z.string().datetime().optional()
});

const visitInclude = {
  client: true,
  promoter: { include: { user: true } },
  route: true,
  photos: {
    orderBy: { createdAt: "asc" },
    include: {
      supplier: true,
      supplierExecution: {
        include: {
          supplier: true
        }
      }
    }
  },
  occurrences: true,
  auditFlags: true,
  supplierExecutions: {
    orderBy: { createdAt: "asc" },
    include: {
      supplier: true,
      photos: { orderBy: { createdAt: "asc" } }
    }
  }
} satisfies Prisma.VisitInclude;

function visitCreatePayload(input: SanitizedVisitInput, companyId: string, promoterId?: string | null): Prisma.VisitUncheckedCreateInput {
  return {
    clientGeneratedId: input.clientGeneratedId,
    companyId,
    routeId: input.routeId,
    routeItemId: input.routeItemId,
    clientId: input.clientId,
    promoterId: promoterId ?? input.promoterId,
    status: input.status ?? "pending",
    startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
    finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined,
    gpsLatitude: input.gpsLatitude,
    gpsLongitude: input.gpsLongitude,
    notes: input.notes
  };
}

function visitUpdatePayload(input: SanitizedVisitUpdateInput, companyId?: string | null): Prisma.VisitUncheckedUpdateInput {
  return {
    clientGeneratedId: input.clientGeneratedId,
    companyId,
    routeId: input.routeId,
    routeItemId: input.routeItemId,
    clientId: input.clientId,
    promoterId: input.promoterId,
    status: input.status,
    startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
    finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined,
    gpsLatitude: input.gpsLatitude,
    gpsLongitude: input.gpsLongitude,
    notes: input.notes
  };
}

function dataUrl(contentType: string, base64Image: string) {
  const [, payload = base64Image] = base64Image.split(",");
  return `data:${contentType};base64,${payload.replace(/\s/g, "")}`;
}

async function completeRouteWhenAllItemsDone(tx: Prisma.TransactionClient, routeItemId: string) {
  const routeItem = await tx.routeItem.findUnique({
    where: { id: routeItemId },
    select: { routeId: true }
  });

  if (!routeItem) {
    return;
  }

  const pendingItems = await tx.routeItem.count({
    where: {
      routeId: routeItem.routeId,
      status: { not: "COMPLETED" }
    }
  });

  if (pendingItems === 0) {
    await tx.route.update({
      where: { id: routeItem.routeId },
      data: { status: "COMPLETED" }
    });
  }
}

function resolveSupplierExecutionPhotoField(type: z.infer<typeof photoSchema>["type"]) {
  if (supplierBeforePhotoTypes.has(type)) {
    return "beforePhotoId" as const;
  }

  if (supplierAfterPhotoTypes.has(type)) {
    return "afterPhotoId" as const;
  }

  return null;
}

function supplierExecutionRequiresDeliveryFlow(deliveryReceived: boolean | null | undefined) {
  return deliveryReceived !== false;
}

async function getScopedVisit(visitId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: {
      id: true,
      companyId: true,
      clientId: true,
      promoterId: true,
      status: true
    }
  });

  if (!visit) {
    throw new AppError(404, "VISIT_NOT_FOUND", "Visita nao encontrada.");
  }

  return visit;
}

async function validateSupplierForVisit(companyId: string | null | undefined, clientId: string, supplierId: string) {
  const [supplier, link] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, companyId: true, name: true }
    }),
    prisma.clientSupplier.findFirst({
      where: { clientId, supplierId },
      select: { id: true }
    })
  ]);

  if (!supplier) {
    throw new AppError(404, "SUPPLIER_NOT_FOUND", "Fornecedor da execucao nao foi encontrado.");
  }

  if (companyId && supplier.companyId !== companyId) {
    throw new AppError(400, "SUPPLIER_COMPANY_MISMATCH", "Fornecedor pertence a outra empresa/filial.");
  }

  if (!link) {
    throw new AppError(400, "SUPPLIER_NOT_LINKED_TO_CLIENT", "Fornecedor nao esta vinculado a este cliente.");
  }

  return supplier;
}

async function validateVisitCompletion(visitId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      photos: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          supplierExecutionId: true
        }
      },
      supplierExecutions: {
        include: {
          photos: {
            orderBy: { createdAt: "asc" },
            select: { id: true, type: true }
          }
        }
      }
    }
  });

  if (!visit) {
    throw new AppError(404, "VISIT_NOT_FOUND", "Visita nao encontrada.");
  }

  const photoTypes = new Set(visit.photos.map((photo) => photo.type));
  const linkedSuppliers = await prisma.clientSupplier.findMany({
    where: { clientId: visit.clientId },
    select: {
      supplierId: true,
      supplier: {
        select: {
          name: true
        }
      }
    }
  });

  const missingVisitPhoto = requiredVisitPhotoTypes.find((type) => !photoTypes.has(type));

  if (missingVisitPhoto) {
    throw new AppError(400, "MISSING_REQUIRED_PHOTO", `Visit cannot be completed without ${missingVisitPhoto} photo.`);
  }

  if (linkedSuppliers.length === 0 && visit.supplierExecutions.length === 0) {
    const missingLegacyPhoto = legacyRequiredPhotoTypes.find((type) => !photoTypes.has(type));

    if (missingLegacyPhoto) {
      throw new AppError(400, "MISSING_REQUIRED_PHOTO", `Visit cannot be completed without ${missingLegacyPhoto} photo.`);
    }

    return;
  }

  const incompleteLinkedSupplier = linkedSuppliers.find((linkedSupplier) => {
    const execution = visit.supplierExecutions.find((item) => item.supplierId === linkedSupplier.supplierId);
    return !execution || execution.status !== "completed";
  });

  if (incompleteLinkedSupplier) {
    throw new AppError(
      400,
      "SUPPLIER_EXECUTION_PENDING",
      `Visit cannot be completed before finishing all linked suppliers. Pending supplier: ${incompleteLinkedSupplier.supplier.name}.`
    );
  }

  const invalidExecution = visit.supplierExecutions.find((execution) => {
    if (execution.status !== "completed") {
      return false;
    }

    if (execution.deliveryReceived === null || execution.deliveryReceived === undefined) {
      return true;
    }

    if (!supplierExecutionRequiresDeliveryFlow(execution.deliveryReceived)) {
      return false;
    }

    const executionPhotoTypes = new Set(execution.photos.map((photo) => photo.type));
    const hasBefore = Array.from(executionPhotoTypes).some((type) => supplierBeforePhotoTypes.has(type));
    const hasAfter = Array.from(executionPhotoTypes).some((type) => supplierAfterPhotoTypes.has(type));

    return (
      !hasBefore ||
      !hasAfter ||
      execution.deliveryReceived === null ||
      execution.deliveryReceived === undefined ||
      execution.productsReplenished === null ||
      execution.productsReplenished === undefined ||
      execution.stockoutFound === null ||
      execution.stockoutFound === undefined
    );
  });

  if (invalidExecution) {
    throw new AppError(
      400,
      "SUPPLIER_EXECUTION_INCOMPLETE",
      "Visit cannot be completed while a completed supplier execution is missing answers or required photos."
    );
  }
}

async function sanitizeVisitRelations(input: SanitizedVisitUpdateInput, companyId: string) {
  const [client, route, routeItem, inputPromoter] = await Promise.all([
    input.clientId ? prisma.client.findUnique({ where: { id: input.clientId }, select: { companyId: true } }) : null,
    input.routeId ? prisma.route.findUnique({ where: { id: input.routeId }, select: { id: true, companyId: true } }) : null,
    input.routeItemId
      ? prisma.routeItem.findUnique({ where: { id: input.routeItemId }, select: { id: true, routeId: true, route: { select: { companyId: true } } } })
      : null,
    input.promoterId ? prisma.promoter.findUnique({ where: { id: input.promoterId }, select: { companyId: true } }) : null
  ]);

  if (input.clientId && !client) {
    throw new AppError(404, "CLIENT_NOT_FOUND", "Cliente da visita nao foi encontrado.");
  }

  if (client && client.companyId !== companyId) {
    throw new AppError(400, "VISIT_COMPANY_MISMATCH", "Cliente, rota e visita precisam pertencer a mesma empresa/filial.");
  }

  let routeId: string | null | undefined = input.routeId;
  let routeItemId: string | null | undefined = input.routeItemId;

  if (input.routeId && !route) {
    routeId = null;
    logger.warn({ routeId: input.routeId, clientId: input.clientId }, "mobile visit received with stale route id");
  } else if (route && route.companyId !== companyId) {
    throw new AppError(400, "VISIT_COMPANY_MISMATCH", "Cliente, rota e visita precisam pertencer a mesma empresa/filial.");
  }

  if (input.routeItemId && !routeItem) {
    routeItemId = null;
    logger.warn({ routeItemId: input.routeItemId, clientId: input.clientId }, "mobile visit received with stale route item id");
  } else if (routeItem) {
    if (routeItem.route.companyId !== companyId) {
      throw new AppError(400, "VISIT_COMPANY_MISMATCH", "Cliente, rota e visita precisam pertencer a mesma empresa/filial.");
    }

    routeItemId = routeItem.id;
    routeId = routeItem.routeId;
  }

  if (inputPromoter && inputPromoter.companyId !== companyId) {
    throw new AppError(400, "PROMOTER_COMPANY_MISMATCH", "Promotor pertence a outra empresa/filial.");
  }

  return { routeId, routeItemId };
}

visitsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const visits = await prisma.visit.findMany({
      where: scopedCompanyWhere(req),
      orderBy: { createdAt: "desc" },
      include: visitInclude,
      take: 200
    });

    res.json({ data: visits });
  })
);

visitsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = visitSchema.parse(req.body);

    if (input.status === "completed") {
      throw new AppError(400, "MISSING_REQUIRED_PHOTO", "Visit cannot be created as completed before required photos are uploaded.");
    }

    if (input.clientGeneratedId) {
      const existingVisit = await prisma.visit.findUnique({
        where: { clientGeneratedId: input.clientGeneratedId },
        include: visitInclude
      });

      if (existingVisit) {
        assertSameCompany(req, existingVisit.companyId);
        res.json({ data: existingVisit });
        return;
      }
    }

    const promoter = req.user?.role === "PROMOTOR"
      ? await prisma.promoter.findUnique({ where: { userId: req.user.id } })
      : null;
    const companyId = requireCompanyId(req, input.companyId ?? promoter?.companyId);
    const relations = await sanitizeVisitRelations(input, companyId);

    const visit = await prisma.visit.create({
      data: visitCreatePayload({ ...input, ...relations }, companyId, promoter?.id),
      include: visitInclude
    });

    await evaluateVisitAudit(visit.id);
    res.status(201).json({ data: visit });
  })
);

visitsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = visitSchema.partial().parse(req.body);
    const existing = await prisma.visit.findUnique({
      where: { id: req.params.id },
      select: { companyId: true }
    });

    if (!existing) {
      throw new AppError(404, "VISIT_NOT_FOUND", "Visita nao encontrada.");
    }

    assertSameCompany(req, existing.companyId);
    const companyId = resolveCompanyId(req, input.companyId ?? existing.companyId);
    const relations = companyId ? await sanitizeVisitRelations(input, companyId) : { routeId: input.routeId, routeItemId: input.routeItemId };

    if (input.status === "completed") {
      await validateVisitCompletion(req.params.id);
    }

    const visit = await prisma.$transaction(async (tx) => {
      const updated = await tx.visit.update({
        where: { id: req.params.id },
        data: visitUpdatePayload({ ...input, ...relations }, companyId),
        include: visitInclude
      });

      if (input.status === "completed" && updated.routeItemId) {
        await tx.routeItem.update({
          where: { id: updated.routeItemId },
          data: { status: "COMPLETED" }
        });
        await completeRouteWhenAllItemsDone(tx, updated.routeItemId);
      }

      logger.info({ visitId: updated.id, routeItemId: updated.routeItemId, status: updated.status }, "visit synchronized");
      return updated;
    });

    await evaluateVisitAudit(visit.id);
    res.json({ data: visit });
  })
);

visitsRouter.post(
  "/:id/supplier-executions",
  asyncHandler(async (req, res) => {
    const input = supplierExecutionSchema.parse(req.body);
    const visit = await getScopedVisit(req.params.id);
    assertSameCompany(req, visit.companyId);

    if (input.clientGeneratedId) {
      const existingExecution = await prisma.supplierExecution.findUnique({
        where: { clientGeneratedId: input.clientGeneratedId },
        include: { supplier: true, photos: { orderBy: { createdAt: "asc" } } }
      });

      if (existingExecution) {
        assertSameCompany(req, existingExecution.companyId);
        res.json({ data: existingExecution });
        return;
      }
    }

    await validateSupplierForVisit(visit.companyId ?? "", visit.clientId, input.supplierId);

    const execution = await prisma.supplierExecution.create({
      data: {
        clientGeneratedId: input.clientGeneratedId,
        companyId: visit.companyId,
        visitId: visit.id,
        supplierId: input.supplierId,
        clientId: visit.clientId,
        promoterId: visit.promoterId,
        status: input.status ?? "pending",
        deliveryReceived: input.deliveryReceived ?? undefined,
        productsReplenished: input.deliveryReceived === false ? false : input.productsReplenished ?? undefined,
        stockoutFound: input.deliveryReceived === false ? false : input.stockoutFound ?? undefined,
        notes: input.notes,
        startedAtDevice: input.startedAtDevice ? new Date(input.startedAtDevice) : undefined,
        finishedAtDevice: input.finishedAtDevice ? new Date(input.finishedAtDevice) : undefined
      },
      include: {
        supplier: true,
        photos: { orderBy: { createdAt: "asc" } }
      }
    });

    logger.info({ visitId: visit.id, supplierExecutionId: execution.id, supplierId: execution.supplierId }, "supplier execution created");
    await evaluateVisitAudit(visit.id);
    res.status(201).json({ data: execution });
  })
);

visitsRouter.put(
  "/:id/supplier-executions/:executionId",
  asyncHandler(async (req, res) => {
    const input = supplierExecutionSchema.partial().parse(req.body);
    const visit = await getScopedVisit(req.params.id);
    assertSameCompany(req, visit.companyId);

    const existingExecution = await prisma.supplierExecution.findUnique({
      where: { id: req.params.executionId },
      select: {
        id: true,
        visitId: true,
        companyId: true,
        supplierId: true
      }
    });

    if (!existingExecution || existingExecution.visitId !== visit.id) {
      throw new AppError(404, "SUPPLIER_EXECUTION_NOT_FOUND", "Execucao do fornecedor nao foi encontrada para esta visita.");
    }

    assertSameCompany(req, existingExecution.companyId);

    if (input.supplierId) {
      await validateSupplierForVisit(visit.companyId ?? "", visit.clientId, input.supplierId);
    }

    const execution = await prisma.supplierExecution.update({
      where: { id: req.params.executionId },
      data: {
        clientGeneratedId: input.clientGeneratedId,
        supplierId: input.supplierId,
        status: input.status,
        deliveryReceived: input.deliveryReceived,
        productsReplenished: input.deliveryReceived === false ? false : input.productsReplenished,
        stockoutFound: input.deliveryReceived === false ? false : input.stockoutFound,
        notes: input.notes,
        startedAtDevice: input.startedAtDevice ? new Date(input.startedAtDevice) : undefined,
        finishedAtDevice: input.finishedAtDevice ? new Date(input.finishedAtDevice) : undefined,
        syncStatus: "synced"
      },
      include: {
        supplier: true,
        photos: { orderBy: { createdAt: "asc" } }
      }
    });

    logger.info({ visitId: visit.id, supplierExecutionId: execution.id, status: execution.status }, "supplier execution synchronized");
    await evaluateVisitAudit(visit.id);
    res.json({ data: execution });
  })
);

visitsRouter.post(
  "/:id/photos",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const input = photoSchema.parse(req.body);
    const visit = await getScopedVisit(req.params.id);
    assertSameCompany(req, visit.companyId);

    if (input.clientGeneratedId) {
      const existingPhoto = await prisma.visitPhoto.findUnique({
        where: { clientGeneratedId: input.clientGeneratedId },
        include: { visit: { select: { companyId: true } } }
      });

      if (existingPhoto) {
        assertSameCompany(req, existingPhoto.visit.companyId);
        if (req.file) {
          await unlink(req.file.path).catch(() => undefined);
        }

        res.json({ data: existingPhoto });
        return;
      }
    }

    if (!req.file) {
      throw new AppError(400, "PHOTO_REQUIRED", "Photo file is required.");
    }

    let supplierExecutionId = input.supplierExecutionId ?? null;
    let supplierId = input.supplierId ?? null;

    if (supplierExecutionId) {
      const supplierExecution = await prisma.supplierExecution.findUnique({
        where: { id: supplierExecutionId },
        select: { id: true, visitId: true, supplierId: true }
      });

      if (!supplierExecution || supplierExecution.visitId !== visit.id) {
        throw new AppError(400, "SUPPLIER_EXECUTION_NOT_FOUND", "Execucao do fornecedor nao foi encontrada para esta visita.");
      }

      supplierExecutionId = supplierExecution.id;
      supplierId = supplierExecution.supplierId;
    } else if (supplierId) {
      await validateSupplierForVisit(visit.companyId ?? "", visit.clientId, supplierId);
    }

    const photo = await prisma.visitPhoto.create({
      data: {
        clientGeneratedId: input.clientGeneratedId,
        visitId: req.params.id,
        supplierExecutionId,
        supplierId,
        type: input.type,
        url: publicUploadUrl(path.basename(req.file.path)),
        storageKey: req.file.path,
        capturedAtDevice: input.capturedAt ? new Date(input.capturedAt) : undefined,
        syncStatus: "synced",
        metadata: {
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          capturedAt: input.capturedAt,
          gpsLatitude: input.gpsLatitude,
          gpsLongitude: input.gpsLongitude
        }
      }
    });

    const executionPhotoField = supplierExecutionId ? resolveSupplierExecutionPhotoField(input.type) : null;

    if (supplierExecutionId && executionPhotoField) {
      await prisma.supplierExecution.update({
        where: { id: supplierExecutionId },
        data: {
          [executionPhotoField]: photo.id
        }
      });
    }

    logger.info({ visitId: req.params.id, photoId: photo.id, type: photo.type }, "visit photo uploaded");
    await evaluateVisitAudit(req.params.id);
    res.status(201).json({ data: photo });
  })
);

visitsRouter.post(
  "/:id/photos/base64",
  asyncHandler(async (req, res) => {
    const input = base64PhotoSchema.parse(req.body);

    if (input.clientGeneratedId) {
      const existingPhoto = await prisma.visitPhoto.findUnique({
        where: { clientGeneratedId: input.clientGeneratedId },
        include: { visit: { select: { companyId: true } } }
      });

      if (existingPhoto) {
        assertSameCompany(req, existingPhoto.visit.companyId);
        res.json({ data: existingPhoto });
        return;
      }
    }

    const visit = await getScopedVisit(req.params.id);
    assertSameCompany(req, visit.companyId);

    let supplierExecutionId = input.supplierExecutionId ?? null;
    let supplierId = input.supplierId ?? null;

    if (supplierExecutionId) {
      const supplierExecution = await prisma.supplierExecution.findUnique({
        where: { id: supplierExecutionId },
        select: { id: true, visitId: true, supplierId: true }
      });

      if (!supplierExecution || supplierExecution.visitId !== visit.id) {
        throw new AppError(400, "SUPPLIER_EXECUTION_NOT_FOUND", "Execucao do fornecedor nao foi encontrada para esta visita.");
      }

      supplierExecutionId = supplierExecution.id;
      supplierId = supplierExecution.supplierId;
    } else if (supplierId) {
      await validateSupplierForVisit(visit.companyId ?? "", visit.clientId, supplierId);
    }

    const photo = await prisma.visitPhoto.create({
      data: {
        clientGeneratedId: input.clientGeneratedId,
        visitId: req.params.id,
        supplierExecutionId,
        supplierId,
        type: input.type,
        url: dataUrl(input.contentType, input.base64Image),
        storageKey: null,
        capturedAtDevice: input.capturedAt ? new Date(input.capturedAt) : undefined,
        syncStatus: "synced",
        metadata: {
          contentType: input.contentType,
          sizeBytes: Math.ceil(input.base64Image.length * 0.75),
          capturedAt: input.capturedAt,
          gpsLatitude: input.gpsLatitude,
          gpsLongitude: input.gpsLongitude,
          source: "mobile_base64"
        }
      }
    });

    const executionPhotoField = supplierExecutionId ? resolveSupplierExecutionPhotoField(input.type) : null;

    if (supplierExecutionId && executionPhotoField) {
      await prisma.supplierExecution.update({
        where: { id: supplierExecutionId },
        data: {
          [executionPhotoField]: photo.id
        }
      });
    }

    logger.info({ visitId: req.params.id, photoId: photo.id, type: photo.type }, "visit photo uploaded as base64");
    await evaluateVisitAudit(req.params.id);
    res.status(201).json({ data: photo });
  })
);

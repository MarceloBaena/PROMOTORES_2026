import path from "node:path";
import { unlink } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { upload, publicUploadUrl } from "../services/uploads";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

export const visitsRouter = Router();

const requiredPhotoTypes = ["checkin", "before", "after"] as const;

const visitSchema = z.object({
  clientGeneratedId: z.string().min(8).max(120).optional(),
  routeId: z.string().uuid().optional(),
  routeItemId: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  promoterId: z.string().uuid().optional(),
  status: z.enum(["pending", "in_progress", "completed", "not_completed"]).optional(),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  gpsLatitude: z.coerce.number().optional(),
  gpsLongitude: z.coerce.number().optional(),
  notes: z.string().optional()
});

const photoSchema = z.object({
  type: z.enum(["checkin", "before", "after", "occurrence_extra"]).default("occurrence_extra"),
  clientGeneratedId: z.string().min(8).max(120).optional(),
  capturedAt: z.string().datetime().optional(),
  gpsLatitude: z.coerce.number().optional(),
  gpsLongitude: z.coerce.number().optional()
});

const base64PhotoSchema = photoSchema.extend({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
  base64Image: z.string().min(100)
});

function visitCreatePayload(input: z.infer<typeof visitSchema>, promoterId?: string | null): Prisma.VisitUncheckedCreateInput {
  return {
    clientGeneratedId: input.clientGeneratedId,
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

function visitUpdatePayload(input: Partial<z.infer<typeof visitSchema>>): Prisma.VisitUncheckedUpdateInput {
  return {
    clientGeneratedId: input.clientGeneratedId,
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

visitsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const visits = await prisma.visit.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        promoter: { include: { user: true } },
        route: true,
        photos: true,
        occurrences: true,
        auditFlags: true
      },
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
        include: {
          client: true,
          promoter: { include: { user: true } },
          photos: true,
          occurrences: true,
          auditFlags: true
        }
      });

      if (existingVisit) {
        res.json({ data: existingVisit });
        return;
      }
    }

    const promoter = req.user?.role === "PROMOTOR"
      ? await prisma.promoter.findUnique({ where: { userId: req.user.id } })
      : null;

    const visit = await prisma.visit.create({
      data: visitCreatePayload(input, promoter?.id),
      include: {
        client: true,
        promoter: { include: { user: true } },
        photos: true,
        occurrences: true,
        auditFlags: true
      }
    });

    res.status(201).json({ data: visit });
  })
);

visitsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = visitSchema.partial().parse(req.body);

    if (input.status === "completed") {
      const photos = await prisma.visitPhoto.findMany({
        where: { visitId: req.params.id },
        select: { type: true }
      });
      const photoTypes = new Set(photos.map((photo) => photo.type));
      const missingPhoto = requiredPhotoTypes.find((type) => !photoTypes.has(type));

      if (missingPhoto) {
        throw new AppError(400, "MISSING_REQUIRED_PHOTO", `Visit cannot be completed without ${missingPhoto} photo.`);
      }
    }

    const visit = await prisma.$transaction(async (tx) => {
      const updated = await tx.visit.update({
        where: { id: req.params.id },
        data: visitUpdatePayload(input),
        include: {
          client: true,
          promoter: { include: { user: true } },
          photos: true,
          occurrences: true,
          auditFlags: true
        }
      });

      if (input.status === "completed" && updated.routeItemId) {
        await tx.routeItem.update({
          where: { id: updated.routeItemId },
          data: { status: "COMPLETED" }
        });
      }

      logger.info({ visitId: updated.id, routeItemId: updated.routeItemId, status: updated.status }, "visit synchronized");
      return updated;
    });

    res.json({ data: visit });
  })
);

visitsRouter.post(
  "/:id/photos",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const input = photoSchema.parse(req.body);

    if (input.clientGeneratedId) {
      const existingPhoto = await prisma.visitPhoto.findUnique({
        where: { clientGeneratedId: input.clientGeneratedId }
      });

      if (existingPhoto) {
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

    const photo = await prisma.visitPhoto.create({
      data: {
        clientGeneratedId: input.clientGeneratedId,
        visitId: req.params.id,
        type: input.type,
        url: publicUploadUrl(path.basename(req.file.path)),
        storageKey: req.file.path,
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

    logger.info({ visitId: req.params.id, photoId: photo.id, type: photo.type }, "visit photo uploaded");
    res.status(201).json({ data: photo });
  })
);

visitsRouter.post(
  "/:id/photos/base64",
  asyncHandler(async (req, res) => {
    const input = base64PhotoSchema.parse(req.body);

    if (input.clientGeneratedId) {
      const existingPhoto = await prisma.visitPhoto.findUnique({
        where: { clientGeneratedId: input.clientGeneratedId }
      });

      if (existingPhoto) {
        res.json({ data: existingPhoto });
        return;
      }
    }

    const visit = await prisma.visit.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });

    if (!visit) {
      throw new AppError(404, "VISIT_NOT_FOUND", "Visit was not found for photo upload.");
    }

    const photo = await prisma.visitPhoto.create({
      data: {
        clientGeneratedId: input.clientGeneratedId,
        visitId: req.params.id,
        type: input.type,
        url: dataUrl(input.contentType, input.base64Image),
        storageKey: null,
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

    logger.info({ visitId: req.params.id, photoId: photo.id, type: photo.type }, "visit photo uploaded as base64");
    res.status(201).json({ data: photo });
  })
);

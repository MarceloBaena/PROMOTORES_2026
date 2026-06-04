import path from "node:path";
import { unlink } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { upload, publicUploadUrl } from "../services/uploads";
import { AppError } from "../lib/errors";

export const visitsRouter = Router();

const requiredPhotoTypes = ["checkin", "before", "after"] as const;

const visitSchema = z.object({
  clientGeneratedId: z.string().min(8).max(120).optional(),
  routeId: z.string().uuid().optional(),
  routeItemId: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  promoterId: z.string().uuid().optional(),
  status: z.enum(["pending", "in_progress", "completed", "not_completed"]).optional(),
  notes: z.string().optional()
});

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
      data: {
        ...input,
        promoterId: promoter?.id ?? input.promoterId,
        status: input.status ?? "pending"
      },
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
    const input = visitSchema.partial().extend({
      startedAt: z.string().datetime().optional(),
      finishedAt: z.string().datetime().optional(),
      gpsLatitude: z.coerce.number().optional(),
      gpsLongitude: z.coerce.number().optional()
    }).parse(req.body);

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

    const visit = await prisma.visit.update({
      where: { id: req.params.id },
      data: {
        ...input,
        startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
        finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined
      },
      include: {
        client: true,
        promoter: { include: { user: true } },
        photos: true,
        occurrences: true,
        auditFlags: true
      }
    });

    res.json({ data: visit });
  })
);

visitsRouter.post(
  "/:id/photos",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const input = z.object({
      type: z.enum(["checkin", "before", "after", "occurrence_extra"]).default("occurrence_extra"),
      clientGeneratedId: z.string().min(8).max(120).optional(),
      capturedAt: z.string().datetime().optional(),
      gpsLatitude: z.coerce.number().optional(),
      gpsLongitude: z.coerce.number().optional()
    }).parse(req.body);

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

    res.status(201).json({ data: photo });
  })
);

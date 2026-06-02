import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { upload, publicUploadUrl } from "../services/uploads";
import { AppError } from "../lib/errors";

export const visitsRouter = Router();

const visitSchema = z.object({
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
    const visit = await prisma.visit.create({
      data: {
        ...input,
        status: input.status ?? "pending"
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
    const type = z.enum(["checkin", "before", "after", "occurrence_extra"]).parse(req.body.type ?? "occurrence_extra");

    if (!req.file) {
      throw new AppError(400, "PHOTO_REQUIRED", "Photo file is required.");
    }

    const photo = await prisma.visitPhoto.create({
      data: {
        visitId: req.params.id,
        type,
        url: publicUploadUrl(path.basename(req.file.path)),
        storageKey: req.file.path,
        metadata: {
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size
        }
      }
    });

    res.status(201).json({ data: photo });
  })
);

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";

export const routePlansRouter = Router();

const routeSchema = z.object({
  name: z.string().min(2),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]).optional(),
  scheduledDate: z.string().datetime().optional(),
  supervisorId: z.string().uuid().optional(),
  promoterId: z.string().uuid().optional(),
  clientIds: z.array(z.string().uuid()).default([])
});

routePlansRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const routes = await prisma.route.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        promoter: { include: { user: true } },
        supervisor: { include: { user: true } },
        items: { include: { client: true }, orderBy: { sequence: "asc" } }
      }
    });

    res.json({ data: routes });
  })
);

routePlansRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = routeSchema.parse(req.body);
    const route = await prisma.route.create({
      data: {
        name: input.name,
        status: input.status ?? "DRAFT",
        scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : undefined,
        supervisorId: input.supervisorId,
        promoterId: input.promoterId,
        items: {
          create: input.clientIds.map((clientId, index) => ({
            clientId,
            sequence: index + 1,
            status: "PLANNED"
          }))
        }
      },
      include: {
        promoter: { include: { user: true } },
        supervisor: { include: { user: true } },
        items: { include: { client: true }, orderBy: { sequence: "asc" } }
      }
    });

    res.status(201).json({ data: route });
  })
);

routePlansRouter.put(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const input = z.object({ status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]) }).parse(req.body);
    const route = await prisma.route.update({
      where: { id: req.params.id },
      data: { status: input.status },
      include: {
        items: { include: { client: true }, orderBy: { sequence: "asc" } }
      }
    });

    res.json({ data: route });
  })
);

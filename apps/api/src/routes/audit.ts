import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";

export const auditRouter = Router();

auditRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const flags = await prisma.auditFlag.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        visit: {
          include: {
            client: true,
            promoter: { include: { user: true } }
          }
        }
      },
      take: 200
    });

    res.json({ data: flags });
  })
);

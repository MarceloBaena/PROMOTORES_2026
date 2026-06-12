import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { scopedCompanyWhere } from "../lib/tenant";

export const auditRouter = Router();

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const flags = await prisma.auditFlag.findMany({
      where: {
        visit: scopedCompanyWhere(req)
      },
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

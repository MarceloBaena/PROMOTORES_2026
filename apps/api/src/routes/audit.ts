import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { AppError } from "../lib/errors";
import { assertSameCompany, scopedCompanyWhere } from "../lib/tenant";

export const auditRouter = Router();

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const flags = await prisma.auditFlag.findMany({
      where: {
        resolved: false,
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

auditRouter.patch(
  "/:id/resolve",
  asyncHandler(async (req, res) => {
    const flag = await prisma.auditFlag.findUnique({
      where: { id: req.params.id },
      include: {
        visit: {
          select: {
            companyId: true
          }
        }
      }
    });

    if (!flag) {
      throw new AppError(404, "AUDIT_FLAG_NOT_FOUND", "Alerta de auditoria nao encontrado.");
    }

    assertSameCompany(req, flag.visit.companyId);

    const resolved = await prisma.auditFlag.update({
      where: { id: flag.id },
      data: { resolved: true }
    });

    res.json({ data: resolved });
  })
);

auditRouter.post(
  "/:id/requeue",
  asyncHandler(async (req, res) => {
    const flag = await prisma.auditFlag.findUnique({
      where: { id: req.params.id },
      include: {
        visit: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                companyId: true,
                defaultPromoterId: true
              }
            },
            promoter: {
              select: {
                id: true,
                companyId: true,
                supervisorId: true,
                user: { select: { name: true } }
              }
            }
          }
        }
      }
    });

    if (!flag) {
      throw new AppError(404, "AUDIT_FLAG_NOT_FOUND", "Alerta de auditoria nao encontrado.");
    }

    assertSameCompany(req, flag.visit.companyId);

    const companyId = flag.visit.companyId ?? flag.visit.client.companyId;
    const promoterId = flag.visit.promoterId ?? flag.visit.client.defaultPromoterId;

    if (!companyId) {
      throw new AppError(400, "COMPANY_REQUIRED", "Nao foi possivel identificar a empresa/filial do atendimento.");
    }

    if (!promoterId) {
      throw new AppError(400, "PROMOTER_REQUIRED", "Cliente sem promotor vinculado para criar novo roteiro.");
    }

    const promoter = flag.visit.promoterId
      ? flag.visit.promoter
      : await prisma.promoter.findUnique({
          where: { id: promoterId },
          select: {
            id: true,
            companyId: true,
            supervisorId: true,
            user: { select: { name: true } }
          }
        });

    if (!promoter || promoter.companyId !== companyId) {
      throw new AppError(400, "PROMOTER_COMPANY_MISMATCH", "Promotor pertence a outra empresa/filial.");
    }

    const scheduledDate = new Date();
    const route = await prisma.$transaction(async (tx) => {
      await tx.route.updateMany({
        where: {
          companyId,
          promoterId,
          status: "PUBLISHED",
          items: {
            some: {
              status: { not: "COMPLETED" }
            }
          }
        },
        data: { status: "CANCELLED" }
      });

      const createdRoute = await tx.route.create({
        data: {
          companyId,
          name: `Revisita - ${flag.visit.client.name}`,
          status: "PUBLISHED",
          scheduledDate,
          promoterId,
          supervisorId: promoter.supervisorId,
          items: {
            create: {
              clientId: flag.visit.client.id,
              sequence: 1,
              status: "PLANNED"
            }
          }
        },
        include: {
          promoter: { include: { user: true } },
          items: { include: { client: true }, orderBy: { sequence: "asc" } }
        }
      });

      await tx.auditFlag.update({
        where: { id: flag.id },
        data: { resolved: true }
      });

      return createdRoute;
    });

    res.status(201).json({ data: route });
  })
);

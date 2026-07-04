import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { asyncHandler } from "../middleware/async-handler";
import { assertSameCompany, requireCompanyId, scopedCompanyWhere } from "../lib/tenant";

export const clientActivitiesRouter = Router();

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const activitySchema = z.object({
  companyId: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome da atividade."),
  description: z.preprocess(emptyStringToUndefined, z.string().trim().optional()),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional()
});

async function assertUniqueActivityName(companyId: string, name?: string, ignoreActivityId?: string) {
  if (!name) {
    return;
  }

  const existing = await prisma.clientActivityType.findFirst({
    where: {
      companyId,
      name: { equals: name, mode: "insensitive" },
      ...(ignoreActivityId ? { id: { not: ignoreActivityId } } : {})
    },
    select: { id: true }
  });

  if (existing) {
    throw new AppError(409, "ACTIVITY_NAME_DUPLICATED", "Ja existe atividade com este nome nesta empresa/filial.");
  }
}

function activityInclude() {
  return {
    company: true,
    _count: {
      select: {
        clients: true
      }
    }
  } as const;
}

clientActivitiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const numericCode = /^\d+$/.test(q) ? Number(q) : undefined;
    const status = typeof req.query.status === "string" && ["ACTIVE", "INACTIVE"].includes(req.query.status)
      ? req.query.status as "ACTIVE" | "INACTIVE"
      : undefined;

    const activities = await prisma.clientActivityType.findMany({
      where: {
        ...scopedCompanyWhere(req),
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { company: { name: { contains: q, mode: "insensitive" } } },
                ...(numericCode ? [{ code: numericCode }] : [])
              ]
            }
          : {})
      },
      orderBy: [{ status: "asc" }, { code: "asc" }],
      take: 80,
      include: activityInclude()
    });

    res.json({ data: activities });
  })
);

clientActivitiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const activity = await prisma.clientActivityType.findUnique({
      where: { id: req.params.id },
      include: {
        ...activityInclude(),
        clients: {
          include: {
            client: true
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!activity) {
      throw new AppError(404, "ACTIVITY_NOT_FOUND", "Atividade nao encontrada.");
    }

    assertSameCompany(req, activity.companyId);
    res.json({ data: activity });
  })
);

clientActivitiesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = activitySchema.parse(req.body);
    const companyId = requireCompanyId(req, input.companyId);

    await assertUniqueActivityName(companyId, input.name);

    const activity = await prisma.clientActivityType.create({
      data: {
        ...input,
        companyId,
        status: input.status ?? "ACTIVE"
      },
      include: activityInclude()
    });

    res.status(201).json({ data: activity });
  })
);

clientActivitiesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = activitySchema.partial().parse(req.body);
    const existing = await prisma.clientActivityType.findUnique({
      where: { id: req.params.id },
      select: { id: true, companyId: true }
    });

    if (!existing) {
      throw new AppError(404, "ACTIVITY_NOT_FOUND", "Atividade nao encontrada.");
    }

    assertSameCompany(req, existing.companyId);
    const companyId = input.companyId ? requireCompanyId(req, input.companyId) : existing.companyId;

    if (!companyId) {
      throw new AppError(400, "COMPANY_REQUIRED", "Atividade precisa estar vinculada a uma empresa/filial.");
    }

    await assertUniqueActivityName(companyId, input.name, existing.id);

    const activity = await prisma.clientActivityType.update({
      where: { id: existing.id },
      data: {
        ...input,
        companyId
      },
      include: activityInclude()
    });

    res.json({ data: activity });
  })
);

clientActivitiesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.clientActivityType.findUnique({
      where: { id: req.params.id },
      select: { id: true, companyId: true }
    });

    if (!existing) {
      throw new AppError(404, "ACTIVITY_NOT_FOUND", "Atividade nao encontrada.");
    }

    assertSameCompany(req, existing.companyId);

    await prisma.clientActivityType.update({
      where: { id: existing.id },
      data: { status: "INACTIVE" }
    });

    res.status(204).send();
  })
);

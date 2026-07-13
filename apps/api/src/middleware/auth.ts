import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { RoleCode } from "@sales-promoters/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { requireConfig } from "../config/env";
import { asyncHandler } from "./async-handler";

interface AccessTokenPayload extends jwt.JwtPayload {
  sub: string;
  type: "access";
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestedCompanyId(req: Request) {
  const headerCompanyId = req.header("x-company-id")?.trim();
  const queryCompanyId = typeof req.query.companyId === "string" ? req.query.companyId.trim() : undefined;
  const value = headerCompanyId || queryCompanyId;

  return value ? value : null;
}

export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    throw new AppError(401, "UNAUTHORIZED", "Missing bearer token.");
  }

  const config = requireConfig();
  let payload: AccessTokenPayload;

  try {
    payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Invalid or expired access token.");
  }

  if (payload.type !== "access" || !payload.sub) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid access token payload.");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: {
      role: true,
      company: true,
      supervisor: { select: { id: true } },
      promoter: { select: { id: true, supervisorId: true } }
    }
  });

  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "UNAUTHORIZED", "User is not active.");
  }

  if (user.role.code !== "ADMIN" && !user.companyId) {
    throw new AppError(403, "COMPANY_REQUIRED", "Usuario precisa estar vinculado a uma empresa/filial.");
  }

  if (user.companyId && (!user.company || user.company.status !== "ACTIVE")) {
    throw new AppError(403, "COMPANY_INACTIVE", "Empresa/filial do usuario esta inativa.");
  }

  let companyScope = user.company
    ? {
        id: user.company.id,
        code: user.company.code,
        name: user.company.name,
        status: user.company.status
      }
    : null;

  let companyScopeId = user.companyId ?? null;

  if (!user.companyId && user.role.code === "ADMIN") {
    const nextCompanyId = requestedCompanyId(req);

    if (nextCompanyId) {
      if (!UUID_PATTERN.test(nextCompanyId)) {
        throw new AppError(400, "COMPANY_SCOPE_INVALID", "Empresa/filial selecionada eh invalida.");
      }

      const selectedCompany = await prisma.company.findUnique({
        where: { id: nextCompanyId },
        select: {
          id: true,
          code: true,
          name: true,
          status: true
        }
      });

      if (!selectedCompany) {
        throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa/filial selecionada nao foi encontrada.");
      }

      if (selectedCompany.status !== "ACTIVE") {
        throw new AppError(409, "COMPANY_INACTIVE", "Empresa/filial selecionada esta inativa.");
      }

      companyScopeId = selectedCompany.id;
      companyScope = selectedCompany;
    }
  }

  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.code,
    status: user.status,
    companyId: user.companyId,
    supervisorId: user.supervisor?.id ?? null,
    promoterId: user.promoter?.id ?? null,
    company: user.company
      ? {
          id: user.company.id,
          code: user.company.code,
          name: user.company.name
        }
      : null
  };
  req.companyScopeId = companyScopeId;
  req.companyScope = companyScope;

  next();
});

export function authorizeRoles(...roles: RoleCode[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHORIZED", "Authentication required."));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new AppError(403, "FORBIDDEN", "User does not have permission for this resource."));
      return;
    }

    next();
  };
}

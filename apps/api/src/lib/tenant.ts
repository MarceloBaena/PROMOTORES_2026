import type { Request } from "express";
import { AppError } from "./errors";

export function isPlatformAdmin(req: Request) {
  return req.user?.role === "ADMIN" && !req.user.companyId;
}

export function scopedCompanyWhere(req: Request) {
  return req.user?.companyId ? { companyId: req.user.companyId } : {};
}

export function resolveCompanyId(req: Request, requestedCompanyId?: string | null) {
  if (req.user?.companyId) {
    return req.user.companyId;
  }

  return requestedCompanyId || null;
}

export function requireCompanyId(req: Request, requestedCompanyId?: string | null) {
  const companyId = resolveCompanyId(req, requestedCompanyId);

  if (!companyId) {
    throw new AppError(400, "COMPANY_REQUIRED", "Selecione a empresa/filial para este registro.");
  }

  return companyId;
}

export function assertSameCompany(req: Request, companyId?: string | null) {
  if (req.user?.companyId && companyId !== req.user.companyId) {
    throw new AppError(403, "COMPANY_FORBIDDEN", "Registro pertence a outra empresa/filial.");
  }
}

import type { Request } from "express";
import { AppError } from "./errors";

export function isPlatformAdmin(req: Request) {
  return req.user?.role === "ADMIN" && !req.user.companyId;
}

export function getCompanyScope(req: Request) {
  return {
    isGlobalAdmin: isPlatformAdmin(req),
    companyId: req.user?.companyId ?? req.companyScopeId ?? null
  };
}

export function scopedCompanyWhere(req: Request) {
  const { companyId } = getCompanyScope(req);
  return companyId ? { companyId } : {};
}

export function buildCompanyWhere<T extends Record<string, unknown>>(req: Request, where: T) {
  const { companyId } = getCompanyScope(req);
  return companyId ? { ...where, companyId } : where;
}

export function withCompanyScope<T extends Record<string, unknown>>(req: Request, where: T) {
  return buildCompanyWhere(req, where);
}

export function requireSupervisorProfileId(req: Request) {
  if (req.user?.role !== "SUPERVISOR") {
    return null;
  }

  if (!req.user.supervisorId) {
    throw new AppError(403, "SUPERVISOR_PROFILE_REQUIRED", "Supervisor sem cadastro vinculado nao pode acessar este recurso.");
  }

  return req.user.supervisorId;
}

export function scopedSupervisorAssignment(req: Request) {
  const supervisorId = requireSupervisorProfileId(req);

  return supervisorId ? { supervisorId } : {};
}

export function assertSupervisorScope(req: Request, supervisorId?: string | null) {
  const ownSupervisorId = requireSupervisorProfileId(req);

  if (ownSupervisorId && supervisorId !== ownSupervisorId) {
    throw new AppError(403, "SUPERVISOR_FORBIDDEN", "Supervisor pode acessar apenas registros da propria equipe.");
  }
}

export function resolveCompanyId(req: Request, requestedCompanyId?: string | null) {
  if (req.user?.companyId) {
    return req.user.companyId;
  }

  return requestedCompanyId || req.companyScopeId || null;
}

export function requireCompanyId(req: Request, requestedCompanyId?: string | null) {
  const companyId = resolveCompanyId(req, requestedCompanyId);

  if (!companyId) {
    throw new AppError(400, "COMPANY_REQUIRED", "Selecione a empresa/filial para este registro.");
  }

  return companyId;
}

export function assertSameCompany(req: Request, companyId?: string | null) {
  const { companyId: scopedCompanyId } = getCompanyScope(req);

  if (scopedCompanyId && companyId !== scopedCompanyId) {
    throw new AppError(403, "COMPANY_FORBIDDEN", "Registro pertence a outra empresa/filial.");
  }
}

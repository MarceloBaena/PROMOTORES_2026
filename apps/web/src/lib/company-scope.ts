import type { SessionUser } from "@sales-promoters/shared";

const COMPANY_SCOPE_STORAGE_KEY = "sales-promoters-company-scope";

export function isGlobalAdminUser(user?: SessionUser | null) {
  return user?.role === "ADMIN" && !user.companyId;
}

export function getStoredCompanyScopeId() {
  return localStorage.getItem(COMPANY_SCOPE_STORAGE_KEY) ?? "";
}

export function saveStoredCompanyScopeId(companyId: string) {
  if (!companyId) {
    localStorage.removeItem(COMPANY_SCOPE_STORAGE_KEY);
    return;
  }

  localStorage.setItem(COMPANY_SCOPE_STORAGE_KEY, companyId);
}

export function clearStoredCompanyScopeId() {
  localStorage.removeItem(COMPANY_SCOPE_STORAGE_KEY);
}

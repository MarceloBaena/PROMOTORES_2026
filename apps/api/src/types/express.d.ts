import type { CompanyStatus, RoleCode, UserStatus } from "@sales-promoters/shared";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: RoleCode;
        status: UserStatus;
        companyId?: string | null;
        supervisorId?: string | null;
        promoterId?: string | null;
        company?: {
          id: string;
          code: number;
          name: string;
        } | null;
      };
      companyScopeId?: string | null;
      companyScope?: {
        id: string;
        code: number;
        name: string;
        status: CompanyStatus;
      } | null;
    }
  }
}

export {};

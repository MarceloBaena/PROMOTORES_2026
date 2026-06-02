import type { RoleCode, UserStatus } from "@sales-promoters/shared";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: RoleCode;
        status: UserStatus;
      };
    }
  }
}

export {};

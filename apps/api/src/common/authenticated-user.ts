import type { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
}

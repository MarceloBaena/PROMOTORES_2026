import { DEFAULT_USERS } from "@sales-promoters/shared";
import type { RoleCode } from "@sales-promoters/shared";
import { prisma } from "../lib/prisma";
import { hashPassword } from "./auth-service";

const roleNames: Record<RoleCode, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  PROMOTOR: "Promotor"
};

interface BootstrapOptions {
  resetPasswords: boolean;
}

async function ensureRole(code: RoleCode) {
  return prisma.role.upsert({
    where: { code },
    create: {
      code,
      name: roleNames[code]
    },
    update: {
      name: roleNames[code]
    }
  });
}

async function ensureUser(input: {
  email: string;
  name: string;
  password: string;
  roleCode: RoleCode;
  resetPasswords: boolean;
}) {
  const role = await ensureRole(input.roleCode);
  const existing = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (!existing) {
    return prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        status: "ACTIVE",
        roleId: role.id
      }
    });
  }

  return prisma.user.update({
    where: { id: existing.id },
    data: {
      name: input.name,
      roleId: role.id,
      status: "ACTIVE",
      ...(input.resetPasswords
        ? {
            passwordHash: await hashPassword(input.password)
          }
        : {})
    }
  });
}

export async function bootstrapAccess(options: BootstrapOptions) {
  await Promise.all((["ADMIN", "SUPERVISOR", "PROMOTOR"] as RoleCode[]).map((role) => ensureRole(role)));

  const admin = await ensureUser({
    email: DEFAULT_USERS.admin.email,
    name: "Admin Sales Promoters",
    password: DEFAULT_USERS.admin.password,
    roleCode: "ADMIN",
    resetPasswords: options.resetPasswords
  });

  const supervisor = await ensureUser({
    email: DEFAULT_USERS.supervisor.email,
    name: "Supervisor Sales Promoters",
    password: DEFAULT_USERS.supervisor.password,
    roleCode: "SUPERVISOR",
    resetPasswords: options.resetPasswords
  });

  await prisma.supervisor.upsert({
    where: { userId: supervisor.id },
    create: {
      userId: supervisor.id,
      status: "ACTIVE"
    },
    update: {
      status: "ACTIVE"
    }
  });

  return {
    roles: ["ADMIN", "SUPERVISOR", "PROMOTOR"],
    users: [admin.email, supervisor.email]
  };
}

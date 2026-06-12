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
  companyId?: string | null;
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
        companyId: input.companyId ?? null,
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
      companyId: input.companyId ?? existing.companyId,
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

  const defaultCompany = await prisma.company.upsert({
    where: { code: 1 },
    create: {
      name: "Empresa Padrao",
      status: "ACTIVE"
    },
    update: {
      status: "ACTIVE"
    }
  });

  const admin = await ensureUser({
    email: DEFAULT_USERS.admin.email,
    name: "Admin Sales Promoters",
    password: DEFAULT_USERS.admin.password,
    roleCode: "ADMIN",
    resetPasswords: options.resetPasswords,
    companyId: null
  });

  const supervisor = await ensureUser({
    email: DEFAULT_USERS.supervisor.email,
    name: "Supervisor Sales Promoters",
    password: DEFAULT_USERS.supervisor.password,
    roleCode: "SUPERVISOR",
    resetPasswords: options.resetPasswords,
    companyId: defaultCompany.id
  });

  await prisma.supervisor.upsert({
    where: { userId: supervisor.id },
    create: {
      companyId: defaultCompany.id,
      userId: supervisor.id,
      status: "ACTIVE"
    },
    update: {
      companyId: defaultCompany.id,
      status: "ACTIVE"
    }
  });

  return {
    roles: ["ADMIN", "SUPERVISOR", "PROMOTOR"],
    users: [admin.email, supervisor.email]
  };
}

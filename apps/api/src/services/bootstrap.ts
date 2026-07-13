import type { RoleCode } from "@sales-promoters/shared";
import { prisma } from "../lib/prisma";
import { hashPassword } from "./auth-service";

const DEFAULT_ACCESS_USERS = {
  admin: {
    email: "admin@salespromoters.local",
    password: "Admin@123"
  },
  supervisor: {
    email: "supervisor@salespromoters.local",
    password: "Supervisor@123"
  }
} as const;

const roleNames: Record<RoleCode, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  PROMOTOR: "Promotor"
};

const MULTI_COMPANY_DEMO = [
  {
    company: {
      name: "Formula Distribuidora Demo",
      document: "13555022000160",
      contactName: "Operacao Formula",
      contactPhone: "(65) 99999-1001",
      contactEmail: "contato.formula.demo@salespromoters.local",
      address: "Avenida da Integracao",
      addressNumber: "1200",
      district: "Centro Norte",
      city: "Varzea Grande",
      state: "MT"
    },
    supervisor: {
      email: "supervisor.formula@salespromoters.local",
      name: "Supervisor Formula Demo",
      password: "Supervisor@123",
      region: "MT - Operacao Formula"
    },
    promoters: [
      {
        key: "formula-main",
        email: "promotor.formula@salespromoters.local",
        name: "Promotor Formula Demo",
        password: "Promotor@123",
        phone: "(65) 99999-2001"
      }
    ],
    categories: [
      { name: "Mercearia", description: "Categoria base de mercearia seca." },
      { name: "Bebidas", description: "Categoria de bebidas e refrigeracao." }
    ],
    suppliers: [
      {
        name: "Zaeli Demo",
        tradeName: "Zaeli",
        document: "27888888000110",
        contactName: "Canal Distribuidor",
        phone: "(65) 4000-1001",
        email: "zaeli.demo@salespromoters.local",
        categoryNames: ["Mercearia"]
      },
      {
        name: "Qualimax Demo",
        tradeName: "Qualimax",
        document: "27888888000111",
        contactName: "Equipe Qualimax",
        phone: "(65) 4000-1002",
        email: "qualimax.demo@salespromoters.local",
        categoryNames: ["Mercearia", "Bebidas"]
      }
    ],
    activities: [
      { name: "Abastecimento", description: "Reposicao e organizacao da gondola." },
      { name: "Ponto extra", description: "Montagem ou manutencao de ponto extra." }
    ],
    clients: [
      {
        code: "0001",
        name: "Cliente Demo Formula",
        document: "12345678000101",
        representative: "Vendedor Formula",
        address: "Avenida dos Distribuidores",
        addressNumber: "100",
        district: "Centro",
        city: "Varzea Grande",
        state: "MT",
        latitude: -15.6467,
        longitude: -56.1323,
        promoterKey: "formula-main",
        supplierNames: ["Zaeli Demo", "Qualimax Demo"],
        activityNames: ["Abastecimento", "Ponto extra"]
      },
      {
        code: "0002",
        name: "Mercado Parceiro Formula",
        document: "12345678000102",
        representative: "Canal Formula",
        address: "Rua do Comercio",
        addressNumber: "55",
        district: "Jardim Industria",
        city: "Cuiaba",
        state: "MT",
        latitude: -15.5989,
        longitude: -56.0949,
        promoterKey: "formula-main",
        supplierNames: ["Qualimax Demo"],
        activityNames: ["Abastecimento"]
      }
    ]
  },
  {
    company: {
      name: "Operacao Norte Demo",
      document: "24681012000190",
      contactName: "Operacao Norte",
      contactPhone: "(62) 99999-3001",
      contactEmail: "contato.norte.demo@salespromoters.local",
      address: "Avenida das Rotas",
      addressNumber: "500",
      district: "Distrito Comercial",
      city: "Goiania",
      state: "GO"
    },
    supervisor: {
      email: "supervisor.norte@salespromoters.local",
      name: "Supervisor Norte Demo",
      password: "Supervisor@123",
      region: "GO - Operacao Norte"
    },
    promoters: [
      {
        key: "norte-main",
        email: "promotor.norte@salespromoters.local",
        name: "Promotor Norte Demo",
        password: "Promotor@123",
        phone: "(62) 99999-3002"
      }
    ],
    categories: [
      { name: "Snacks", description: "Categoria de snacks e conveniencia." },
      { name: "Congelados", description: "Categoria de congelados." }
    ],
    suppliers: [
      {
        name: "SaborMax Demo",
        tradeName: "SaborMax",
        document: "31888888000110",
        contactName: "Equipe SaborMax",
        phone: "(62) 4000-3001",
        email: "sabormax.demo@salespromoters.local",
        categoryNames: ["Snacks"]
      },
      {
        name: "Nutribras Demo",
        tradeName: "Nutribras",
        document: "31888888000111",
        contactName: "Equipe Nutribras",
        phone: "(62) 4000-3002",
        email: "nutribras.demo@salespromoters.local",
        categoryNames: ["Congelados"]
      }
    ],
    activities: [
      { name: "Precificacao", description: "Conferencia e ajuste de precos." },
      { name: "Pesquisa de ruptura", description: "Auditoria de ruptura por fornecedor." }
    ],
    clients: [
      {
        code: "0001",
        name: "Loja Norte Demo",
        document: "22345678000101",
        representative: "Vendedor Norte",
        address: "Rua das Filiais",
        addressNumber: "210",
        district: "Setor Central",
        city: "Goiania",
        state: "GO",
        latitude: -16.6869,
        longitude: -49.2648,
        promoterKey: "norte-main",
        supplierNames: ["SaborMax Demo", "Nutribras Demo"],
        activityNames: ["Precificacao", "Pesquisa de ruptura"]
      }
    ]
  }
] as const;

interface BootstrapOptions {
  resetPasswords: boolean;
  includeMultiCompanyDemo?: boolean;
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

async function ensureCompany(input: {
  name: string;
  document?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  addressNumber?: string;
  district?: string;
  city?: string;
  state?: string;
}) {
  const existing = await prisma.company.findFirst({
    where: input.document
      ? {
          OR: [{ document: input.document }, { name: input.name }]
        }
      : {
          name: input.name
        }
  });

  if (!existing) {
    return prisma.company.create({
      data: {
        ...input,
        status: "ACTIVE"
      }
    });
  }

  return prisma.company.update({
    where: { id: existing.id },
    data: {
      ...input,
      status: "ACTIVE"
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

async function ensureSupervisorProfile(input: {
  userId: string;
  companyId: string;
  region?: string;
}) {
  return prisma.supervisor.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      companyId: input.companyId,
      region: input.region,
      status: "ACTIVE"
    },
    update: {
      companyId: input.companyId,
      region: input.region,
      status: "ACTIVE"
    }
  });
}

async function ensurePromoterProfile(input: {
  userId: string;
  companyId: string;
  supervisorId: string;
  phone?: string;
}) {
  return prisma.promoter.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      companyId: input.companyId,
      supervisorId: input.supervisorId,
      phone: input.phone,
      status: "ACTIVE"
    },
    update: {
      companyId: input.companyId,
      supervisorId: input.supervisorId,
      phone: input.phone,
      status: "ACTIVE"
    }
  });
}

async function ensureProductCategory(input: {
  companyId: string;
  name: string;
  description?: string;
}) {
  const existing = await prisma.productCategory.findFirst({
    where: {
      companyId: input.companyId,
      name: input.name
    }
  });

  if (!existing) {
    return prisma.productCategory.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        description: input.description,
        status: "ACTIVE"
      }
    });
  }

  return prisma.productCategory.update({
    where: { id: existing.id },
    data: {
      description: input.description,
      status: "ACTIVE"
    }
  });
}

async function ensureActivityType(input: {
  companyId: string;
  name: string;
  description?: string;
}) {
  const existing = await prisma.clientActivityType.findFirst({
    where: {
      companyId: input.companyId,
      name: input.name
    }
  });

  if (!existing) {
    return prisma.clientActivityType.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        description: input.description,
        status: "ACTIVE"
      }
    });
  }

  return prisma.clientActivityType.update({
    where: { id: existing.id },
    data: {
      description: input.description,
      status: "ACTIVE"
    }
  });
}

async function ensureSupplier(input: {
  companyId: string;
  name: string;
  tradeName?: string;
  document?: string;
  email?: string;
  phone?: string;
  contactName?: string;
}) {
  const existing = await prisma.supplier.findFirst({
    where: {
      companyId: input.companyId,
      name: input.name
    }
  });

  if (!existing) {
    return prisma.supplier.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        tradeName: input.tradeName,
        document: input.document,
        email: input.email,
        phone: input.phone,
        contactName: input.contactName,
        status: "ACTIVE"
      }
    });
  }

  return prisma.supplier.update({
    where: { id: existing.id },
    data: {
      tradeName: input.tradeName,
      document: input.document,
      email: input.email,
      phone: input.phone,
      contactName: input.contactName,
      status: "ACTIVE"
    }
  });
}

async function ensureClient(input: {
  companyId: string;
  code: string;
  name: string;
  document?: string;
  representative?: string;
  address?: string;
  addressNumber?: string;
  district?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  promoterId?: string | null;
}) {
  const existing = await prisma.client.findFirst({
    where: {
      companyId: input.companyId,
      OR: [{ code: input.code }, { name: input.name }]
    }
  });

  if (!existing) {
    return prisma.client.create({
      data: {
        companyId: input.companyId,
        code: input.code,
        name: input.name,
        document: input.document,
        representative: input.representative,
        address: input.address,
        addressNumber: input.addressNumber,
        district: input.district,
        city: input.city,
        state: input.state,
        latitude: input.latitude,
        longitude: input.longitude,
        defaultPromoterId: input.promoterId,
        status: "ACTIVE"
      }
    });
  }

  return prisma.client.update({
    where: { id: existing.id },
    data: {
      code: input.code,
      document: input.document,
      representative: input.representative,
      address: input.address,
      addressNumber: input.addressNumber,
      district: input.district,
      city: input.city,
      state: input.state,
      latitude: input.latitude,
      longitude: input.longitude,
      defaultPromoterId: input.promoterId,
      status: "ACTIVE"
    }
  });
}

async function seedMultiCompanyDemo(options: { resetPasswords: boolean }) {
  const companyNames: string[] = [];
  const userEmails: string[] = [];

  for (const demo of MULTI_COMPANY_DEMO) {
    const company = await ensureCompany(demo.company);
    companyNames.push(company.name);

    const supervisorUser = await ensureUser({
      email: demo.supervisor.email,
      name: demo.supervisor.name,
      password: demo.supervisor.password,
      roleCode: "SUPERVISOR",
      resetPasswords: options.resetPasswords,
      companyId: company.id
    });
    userEmails.push(supervisorUser.email);

    const supervisor = await ensureSupervisorProfile({
      userId: supervisorUser.id,
      companyId: company.id,
      region: demo.supervisor.region
    });

    const promoters = new Map<string, Awaited<ReturnType<typeof ensurePromoterProfile>>>();
    for (const promoterSeed of demo.promoters) {
      const promoterUser = await ensureUser({
        email: promoterSeed.email,
        name: promoterSeed.name,
        password: promoterSeed.password,
        roleCode: "PROMOTOR",
        resetPasswords: options.resetPasswords,
        companyId: company.id
      });
      userEmails.push(promoterUser.email);

      const promoter = await ensurePromoterProfile({
        userId: promoterUser.id,
        companyId: company.id,
        supervisorId: supervisor.id,
        phone: promoterSeed.phone
      });

      promoters.set(promoterSeed.key, promoter);
    }

    const categories = new Map<string, string>();
    for (const categorySeed of demo.categories) {
      const category = await ensureProductCategory({
        companyId: company.id,
        name: categorySeed.name,
        description: categorySeed.description
      });
      categories.set(categorySeed.name, category.id);
    }

    const activities = new Map<string, string>();
    for (const activitySeed of demo.activities) {
      const activity = await ensureActivityType({
        companyId: company.id,
        name: activitySeed.name,
        description: activitySeed.description
      });
      activities.set(activitySeed.name, activity.id);
    }

    const suppliers = new Map<string, string>();
    for (const supplierSeed of demo.suppliers) {
      const supplier = await ensureSupplier({
        companyId: company.id,
        name: supplierSeed.name,
        tradeName: supplierSeed.tradeName,
        document: supplierSeed.document,
        email: supplierSeed.email,
        phone: supplierSeed.phone,
        contactName: supplierSeed.contactName
      });

      suppliers.set(supplierSeed.name, supplier.id);

      const categoryIds = supplierSeed.categoryNames
        .map((name) => categories.get(name))
        .filter((value): value is string => Boolean(value));

      if (categoryIds.length > 0) {
        await prisma.supplierProductCategory.createMany({
          data: categoryIds.map((categoryId) => ({
            supplierId: supplier.id,
            categoryId
          })),
          skipDuplicates: true
        });
      }
    }

    for (const clientSeed of demo.clients) {
      const promoter = promoters.get(clientSeed.promoterKey);
      const client = await ensureClient({
        companyId: company.id,
        code: clientSeed.code,
        name: clientSeed.name,
        document: clientSeed.document,
        representative: clientSeed.representative,
        address: clientSeed.address,
        addressNumber: clientSeed.addressNumber,
        district: clientSeed.district,
        city: clientSeed.city,
        state: clientSeed.state,
        latitude: clientSeed.latitude,
        longitude: clientSeed.longitude,
        promoterId: promoter?.id ?? null
      });

      const supplierIds = clientSeed.supplierNames
        .map((name) => suppliers.get(name))
        .filter((value): value is string => Boolean(value));

      if (supplierIds.length > 0) {
        await prisma.clientSupplier.createMany({
          data: supplierIds.map((supplierId) => ({
            clientId: client.id,
            supplierId
          })),
          skipDuplicates: true
        });
      }

      const activityIds = clientSeed.activityNames
        .map((name) => activities.get(name))
        .filter((value): value is string => Boolean(value));

      if (activityIds.length > 0) {
        await prisma.clientActivityAssignment.createMany({
          data: activityIds.map((activityId) => ({
            clientId: client.id,
            activityId
          })),
          skipDuplicates: true
        });
      }
    }
  }

  return {
    companyNames,
    userEmails
  };
}

export async function bootstrapAccess(options: BootstrapOptions) {
  await Promise.all((["ADMIN", "SUPERVISOR", "PROMOTOR"] as RoleCode[]).map((role) => ensureRole(role)));

  const defaultCompanyByCode = await prisma.company.findUnique({
    where: { code: 1 }
  });

  const defaultCompanyByName = !defaultCompanyByCode
    ? await prisma.company.findFirst({
        where: { name: "Empresa Padrao" }
      })
    : null;

  const defaultCompany = defaultCompanyByCode
    ? await prisma.company.update({
        where: { id: defaultCompanyByCode.id },
        data: { status: "ACTIVE" }
      })
    : defaultCompanyByName
      ? await prisma.company.update({
          where: { id: defaultCompanyByName.id },
          data: { status: "ACTIVE" }
        })
      : await prisma.company.create({
          data: {
            code: 1,
            name: "Empresa Padrao",
            status: "ACTIVE"
          }
        });

  const admin = await ensureUser({
    email: DEFAULT_ACCESS_USERS.admin.email,
    name: "Admin Sales Promoters",
    password: DEFAULT_ACCESS_USERS.admin.password,
    roleCode: "ADMIN",
    resetPasswords: options.resetPasswords,
    companyId: null
  });

  const supervisor = await ensureUser({
    email: DEFAULT_ACCESS_USERS.supervisor.email,
    name: "Supervisor Sales Promoters",
    password: DEFAULT_ACCESS_USERS.supervisor.password,
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

  const demoResult = options.includeMultiCompanyDemo
    ? await seedMultiCompanyDemo({ resetPasswords: options.resetPasswords })
    : { companyNames: [] as string[], userEmails: [] as string[] };

  return {
    roles: ["ADMIN", "SUPERVISOR", "PROMOTOR"],
    users: [admin.email, supervisor.email, ...demoResult.userEmails],
    companies: [defaultCompany.name, ...demoResult.companyNames],
    includeMultiCompanyDemo: options.includeMultiCompanyDemo === true
  };
}

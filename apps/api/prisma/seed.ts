import { hashSync } from 'bcryptjs';
import {
  CustomerSourceType,
  CustomerStatus,
  PrismaClient,
  RoutePlanStatus,
} from '@prisma/client';
import { buildSeedScenario } from './seed-fixtures';

const prisma = new PrismaClient();

async function main() {
  const scenario = buildSeedScenario();

  const company = await prisma.company.upsert({
    where: { code: scenario.company.code },
    update: {
      tradeName: scenario.company.tradeName,
      legalName: scenario.company.legalName,
      documentNumber: scenario.company.documentNumber,
      timeZone: scenario.company.timeZone,
      active: true,
      deletedAt: null,
    },
    create: {
      code: scenario.company.code,
      tradeName: scenario.company.tradeName,
      legalName: scenario.company.legalName,
      documentNumber: scenario.company.documentNumber,
      timeZone: scenario.company.timeZone,
      active: true,
    },
  });

  const usersByKey = new Map<
    string,
    { id: string; email: string; password: string }
  >();

  for (const user of scenario.users) {
    const persistedUser = await prisma.user.upsert({
      where: {
        email: user.email,
      },
      update: {
        companyId: company.id,
        name: user.name,
        role: user.role,
        passwordHash: hashSync(user.password, 12),
        phone: user.phone,
        cpf: user.cpf,
        employeeCode: user.employeeCode,
        employmentStatus: user.status,
        hireDate: user.hireDate,
        region: user.region,
        notes: user.notes,
        active: user.status === 'ACTIVE',
        deletedAt: null,
      },
      create: {
        companyId: company.id,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash: hashSync(user.password, 12),
        phone: user.phone,
        cpf: user.cpf,
        employeeCode: user.employeeCode,
        employmentStatus: user.status,
        hireDate: user.hireDate,
        region: user.region,
        notes: user.notes,
        active: user.status === 'ACTIVE',
      },
    });

    usersByKey.set(user.key, {
      id: persistedUser.id,
      email: persistedUser.email,
      password: user.password,
    });
  }

  for (const promoter of scenario.promoters) {
    const user = usersByKey.get(promoter.userKey);
    const supervisor = usersByKey.get(promoter.supervisorKey);

    if (!user || !supervisor) {
      throw new Error(`Promotor seed invalido: ${promoter.userKey}`);
    }

    await prisma.promoter.upsert({
      where: {
        id: user.id,
      },
      update: {
        companyId: company.id,
        employeeCode: promoter.employeeCode,
        supervisorId: supervisor.id,
        hireDate: promoter.hireDate,
        defaultJourneyStartTime: promoter.defaultJourneyStartTime,
        defaultJourneyEndTime: promoter.defaultJourneyEndTime,
        active: true,
        deletedAt: null,
      },
      create: {
        id: user.id,
        companyId: company.id,
        employeeCode: promoter.employeeCode,
        supervisorId: supervisor.id,
        hireDate: promoter.hireDate,
        defaultJourneyStartTime: promoter.defaultJourneyStartTime,
        defaultJourneyEndTime: promoter.defaultJourneyEndTime,
        active: true,
      },
    });
  }

  const customersByCode = new Map<string, { id: string; tradeName: string }>();

  for (const customer of scenario.customers) {
    const supervisor = usersByKey.get(customer.supervisorUserKey);
    const defaultPromoter = usersByKey.get(customer.defaultPromoterUserKey);

    if (!supervisor || !defaultPromoter) {
      throw new Error(
        `Responsaveis do cliente seed nao encontrados: ${customer.code}`,
      );
    }

    const persistedCustomer = await prisma.customer.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: customer.code,
        },
      },
      update: {
        winthorCustomerCode: customer.winthorCustomerCode,
        tradeName: customer.tradeName,
        legalName: customer.legalName,
        cnpj: customer.cnpj,
        documentNumber: customer.cnpj,
        stateRegistration: customer.stateRegistration,
        contactName: customer.contactName,
        phone: customer.phone,
        email: customer.email,
        zipCode: customer.zipCode,
        address: customer.address,
        addressNumber: customer.addressNumber,
        complement: customer.complement ?? null,
        district: customer.district,
        city: customer.city,
        state: customer.state,
        latitude: customer.latitude,
        longitude: customer.longitude,
        geofenceRadiusM: customer.geofenceRadiusM,
        routeName: customer.routeName,
        region: customer.region,
        supervisorUserId: supervisor.id,
        defaultPromoterUserId: defaultPromoter.id,
        visitFrequency: customer.visitFrequency,
        preferredVisitDays: customer.preferredVisitDays,
        preferredVisitTimeStart: customer.preferredVisitTimeStart,
        preferredVisitTimeEnd: customer.preferredVisitTimeEnd,
        notes: customer.notes,
        sourceType: CustomerSourceType.MANUAL,
        lastSyncedAt: null,
        status: CustomerStatus.ACTIVE,
        active: true,
        deletedAt: null,
      },
      create: {
        companyId: company.id,
        code: customer.code,
        winthorCustomerCode: customer.winthorCustomerCode,
        tradeName: customer.tradeName,
        legalName: customer.legalName,
        cnpj: customer.cnpj,
        documentNumber: customer.cnpj,
        stateRegistration: customer.stateRegistration,
        contactName: customer.contactName,
        phone: customer.phone,
        email: customer.email,
        zipCode: customer.zipCode,
        address: customer.address,
        addressNumber: customer.addressNumber,
        complement: customer.complement ?? null,
        district: customer.district,
        city: customer.city,
        state: customer.state,
        latitude: customer.latitude,
        longitude: customer.longitude,
        geofenceRadiusM: customer.geofenceRadiusM,
        routeName: customer.routeName,
        region: customer.region,
        supervisorUserId: supervisor.id,
        defaultPromoterUserId: defaultPromoter.id,
        visitFrequency: customer.visitFrequency,
        preferredVisitDays: customer.preferredVisitDays,
        preferredVisitTimeStart: customer.preferredVisitTimeStart,
        preferredVisitTimeEnd: customer.preferredVisitTimeEnd,
        notes: customer.notes,
        sourceType: CustomerSourceType.MANUAL,
        lastSyncedAt: null,
        status: CustomerStatus.ACTIVE,
        active: true,
      },
    });

    customersByCode.set(customer.code, {
      id: persistedCustomer.id,
      tradeName: persistedCustomer.tradeName,
    });
  }

  for (const schedule of scenario.schedules) {
    const customer = customersByCode.get(schedule.customerCode);

    if (!customer) {
      throw new Error(
        `Cliente de agenda nao encontrado: ${schedule.customerCode}`,
      );
    }

    await prisma.customerSchedule.upsert({
      where: {
        customerId_dayOfWeek: {
          customerId: customer.id,
          dayOfWeek: schedule.dayOfWeek,
        },
      },
      update: {
        visitWindowStart: schedule.visitWindowStart,
        visitWindowEnd: schedule.visitWindowEnd,
        sequenceHint: schedule.sequenceHint,
        active: true,
        deletedAt: null,
      },
      create: {
        customerId: customer.id,
        dayOfWeek: schedule.dayOfWeek,
        visitWindowStart: schedule.visitWindowStart,
        visitWindowEnd: schedule.visitWindowEnd,
        sequenceHint: schedule.sequenceHint,
        active: true,
      },
    });
  }

  const checklistTemplate = await prisma.checklistTemplate.upsert({
    where: {
      companyId_code_version: {
        companyId: company.id,
        code: scenario.checklistTemplate.code,
        version: scenario.checklistTemplate.version,
      },
    },
    update: {
      name: scenario.checklistTemplate.name,
      description: scenario.checklistTemplate.description,
      active: true,
      deletedAt: null,
    },
    create: {
      companyId: company.id,
      code: scenario.checklistTemplate.code,
      name: scenario.checklistTemplate.name,
      description: scenario.checklistTemplate.description,
      version: scenario.checklistTemplate.version,
      active: true,
    },
  });

  for (const question of scenario.checklistTemplate.questions) {
    await prisma.checklistQuestion.upsert({
      where: {
        checklistTemplateId_code: {
          checklistTemplateId: checklistTemplate.id,
          code: question.code,
        },
      },
      update: {
        label: question.label,
        type: question.type,
        required: question.required,
        sortOrder: question.sortOrder,
        active: true,
      },
      create: {
        checklistTemplateId: checklistTemplate.id,
        code: question.code,
        label: question.label,
        type: question.type,
        required: question.required,
        sortOrder: question.sortOrder,
        active: true,
      },
    });
  }

  const routePromoter = usersByKey.get(scenario.routePlan.promoterKey);
  const routeSupervisor = usersByKey.get(scenario.routePlan.supervisorKey);

  if (!routePromoter || !routeSupervisor) {
    throw new Error('Promotor ou supervisor do roteiro seed nao encontrado');
  }

  const routePlan = await prisma.routePlan.upsert({
    where: {
      routeDate_promoterId: {
        routeDate: scenario.routePlan.routeDate,
        promoterId: routePromoter.id,
      },
    },
    update: {
      companyId: company.id,
      supervisorUserId: routeSupervisor.id,
      status: RoutePlanStatus.PUBLISHED,
      notes: scenario.routePlan.notes,
      active: true,
    },
    create: {
      companyId: company.id,
      routeDate: scenario.routePlan.routeDate,
      promoterId: routePromoter.id,
      supervisorUserId: routeSupervisor.id,
      status: RoutePlanStatus.PUBLISHED,
      notes: scenario.routePlan.notes,
      active: true,
    },
  });

  for (const item of scenario.routePlan.items) {
    const customer = customersByCode.get(item.customerCode);

    if (!customer) {
      throw new Error(
        `Cliente do roteiro nao encontrado: ${item.customerCode}`,
      );
    }

    const existingRoutePlanItem = await prisma.routePlanItem.findFirst({
      where: {
        routePlanId: routePlan.id,
        clientId: customer.id,
      },
      select: {
        id: true,
      },
    });

    if (existingRoutePlanItem) {
      await prisma.routePlanItem.update({
        where: {
          id: existingRoutePlanItem.id,
        },
        data: {
          sequence: item.sequence,
          plannedStartAt: item.plannedStartAt,
          plannedEndAt: item.plannedEndAt,
          active: true,
        },
      });

      continue;
    }

    await prisma.routePlanItem.create({
      data: {
        routePlanId: routePlan.id,
        clientId: customer.id,
        sequence: item.sequence,
        plannedStartAt: item.plannedStartAt,
        plannedEndAt: item.plannedEndAt,
        active: true,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        company: {
          code: company.code,
          tradeName: company.tradeName,
        },
        credentials: {
          admin: usersByKey.get('admin'),
          supervisor: usersByKey.get('supervisor'),
          promoterA: usersByKey.get('promoter_a'),
          promoterB: usersByKey.get('promoter_b'),
        },
        counts: {
          promoters: scenario.promoters.length,
          customers: scenario.customers.length,
          checklistQuestions: scenario.checklistTemplate.questions.length,
          routePlanItems: scenario.routePlan.items.length,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

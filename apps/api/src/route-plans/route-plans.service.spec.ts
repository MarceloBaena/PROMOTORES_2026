import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  NotificationType,
  RouteItemPriority,
  RoutePlanStatus,
  RoutePlanningViewMode,
  RouteRecurrencePattern,
  ScheduleDayOfWeek,
  UserRole,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoutePlansService } from './route-plans.service';

describe('RoutePlansService', () => {
  let routePlansService: RoutePlansService;
  type RoutePlanItemUpdateInput = {
    where: {
      id: string;
    };
    data: {
      active?: boolean;
      cancellationReason?: string | null;
    };
  };
  type NotificationCreateInput = {
    data: {
      recipientUserId: string;
      type: NotificationType;
    };
  };
  type RoutePlanUpdateInput = {
    where: {
      id: string;
    };
    data: {
      status: RoutePlanStatus;
      version: {
        increment: number;
      };
      lastPublishedByUserId: string | null;
      publishedAt: Date | null;
    };
  };
  type RoutePlanCreateCall = [
    {
      data: {
        routeDate: Date;
        status: RoutePlanStatus;
      };
    },
  ];
  type CustomerFindManyCall = [
    {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    },
  ];

  const prismaService = {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
    },
    promoter: {
      findFirst: jest.fn(),
    },
    customer: {
      findMany: jest.fn(),
    },
    routePlan: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    routePlanItem: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    routeChangeLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    routeTemplate: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    routeTemplateItem: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };

  const auditService = {
    record: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        RoutePlansService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: AuditService,
          useValue: auditService,
        },
      ],
    }).compile();

    routePlansService = moduleRef.get(RoutePlansService);

    prismaService.user.findUnique.mockResolvedValue({
      id: 'supervisor-1',
      companyId: 'company-1',
      role: UserRole.SUPERVISOR,
    });
    prismaService.promoter.findFirst.mockResolvedValue({
      id: 'promoter-1',
      supervisorId: 'supervisor-1',
    });
    prismaService.customer.findMany.mockResolvedValue([
      { id: 'customer-1' },
      { id: 'customer-2' },
      { id: 'customer-3' },
    ]);
  });

  it('distribui o batch semanal somente para os dias selecionados', async () => {
    prismaService.routePlan.findFirst.mockResolvedValue(null);
    const createRoutePlanSpy = jest
      .spyOn(routePlansService, 'createRoutePlan')
      .mockImplementation(
        (_actorUserId, dto) =>
          Promise.resolve({
            id: `plan-${dto.routeDate}`,
            routeDate: dto.routeDate,
          }) as never,
      );

    const response = await routePlansService.createRoutePlansBatch(
      'supervisor-1',
      {
        startDate: '2026-03-30',
        endDate: '2026-04-05',
        promoterId: 'promoter-1',
        planningView: RoutePlanningViewMode.WEEKLY,
        weekdays: [ScheduleDayOfWeek.MONDAY, ScheduleDayOfWeek.WEDNESDAY],
        status: RoutePlanStatus.PUBLISHED,
        publishNow: true,
        items: [
          {
            customerId: 'customer-1',
            sequence: 1,
            priority: RouteItemPriority.NORMAL,
          },
        ],
      },
    );

    expect(createRoutePlanSpy).toHaveBeenCalledTimes(2);
    expect(response.count).toBe(2);
    expect(response.createdCount).toBe(2);
  });

  it('cancela itens removidos e gera notificacao ao atualizar um roteiro publicado', async () => {
    const transaction = {
      routePlan: {
        update: jest.fn().mockResolvedValue({
          id: 'route-plan-1',
          version: 2,
        }),
      },
      routePlanItem: {
        update: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue({
          id: 'stop-3',
          client: {
            tradeName: 'Cliente 3',
          },
          sequence: 2,
        }),
      },
      routeChangeLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      notification: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    prismaService.customer.findMany.mockResolvedValueOnce([
      { id: 'customer-1' },
      { id: 'customer-3' },
    ]);

    prismaService.$transaction.mockImplementation(
      async (callback: (input: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    prismaService.routePlan.findFirst
      .mockResolvedValueOnce({
        id: 'route-plan-1',
        companyId: 'company-1',
        promoterId: 'promoter-1',
        planningView: RoutePlanningViewMode.DAILY,
        routeDate: new Date('2026-03-30T00:00:00.000Z'),
        status: RoutePlanStatus.PUBLISHED,
        templateId: null,
        lastPublishedByUserId: 'supervisor-1',
        publishedAt: new Date('2026-03-30T06:00:00.000Z'),
        visits: [],
        stops: [
          {
            id: 'stop-1',
            clientId: 'customer-1',
            sequence: 1,
            priority: RouteItemPriority.NORMAL,
            plannedStartAt: new Date('2026-03-30T10:00:00.000Z'),
            plannedEndAt: new Date('2026-03-30T10:30:00.000Z'),
            notes: null,
            active: true,
            cancelledAt: null,
            cancellationReason: null,
            client: {
              tradeName: 'Cliente 1',
            },
            visit: null,
          },
          {
            id: 'stop-2',
            clientId: 'customer-2',
            sequence: 2,
            priority: RouteItemPriority.NORMAL,
            plannedStartAt: null,
            plannedEndAt: null,
            notes: null,
            active: true,
            cancelledAt: null,
            cancellationReason: null,
            client: {
              tradeName: 'Cliente 2',
            },
            visit: null,
          },
        ],
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'route-plan-1',
        routeDate: new Date('2026-03-30T00:00:00.000Z'),
        planningView: RoutePlanningViewMode.DAILY,
        version: 2,
        status: RoutePlanStatus.PUBLISHED,
        publishedAt: new Date('2026-03-30T06:30:00.000Z'),
        updatedAt: new Date('2026-03-30T06:30:00.000Z'),
        notes: 'Atualizado',
        template: null,
        promoter: {
          id: 'promoter-1',
          employeeCode: 'PROM001',
          user: {
            name: 'Promotor 1',
            email: 'promotor-1@local',
          },
        },
        stops: [],
      });

    const response = await routePlansService.updateRoutePlan(
      'supervisor-1',
      'route-plan-1',
      {
        routeDate: '2026-03-30',
        promoterId: 'promoter-1',
        planningView: RoutePlanningViewMode.DAILY,
        status: RoutePlanStatus.PUBLISHED,
        publishNow: true,
        notes: 'Atualizado',
        items: [
          {
            routePlanItemId: 'stop-1',
            customerId: 'customer-1',
            sequence: 1,
            priority: RouteItemPriority.URGENT,
            plannedStartAt: '2026-03-30T10:00:00.000Z',
            plannedEndAt: '2026-03-30T10:45:00.000Z',
          },
          {
            customerId: 'customer-3',
            sequence: 2,
            priority: RouteItemPriority.HIGH,
          },
        ],
      },
    );

    expect(response.version).toBe(2);
    const routePlanItemUpdateCalls = transaction.routePlanItem.update.mock
      .calls as Array<[RoutePlanItemUpdateInput]>;
    const cancelledUpdateCall = routePlanItemUpdateCalls.find(
      ([input]) => input.where.id === 'stop-2',
    );
    expect(cancelledUpdateCall).toBeDefined();
    expect(cancelledUpdateCall?.[0]).toMatchObject({
      where: {
        id: 'stop-2',
      },
      data: {
        active: false,
        cancellationReason: 'Removido do roteiro pelo supervisor.',
      },
    });

    const notificationCreateCalls = transaction.notification.create.mock
      .calls as Array<[NotificationCreateInput]>;
    const notificationCreateCall = notificationCreateCalls[0];
    expect(notificationCreateCall).toBeDefined();
    expect(notificationCreateCall?.[0]).toMatchObject({
      data: {
        recipientUserId: 'promoter-1',
        type: NotificationType.ROUTE_PUBLISHED,
      },
    });
  });

  it('publica o roteiro preenchendo status e publishedAt no registro correto', async () => {
    const transaction = {
      routePlan: {
        update: jest.fn().mockResolvedValue({
          version: 3,
        }),
      },
      routeChangeLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      notification: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    prismaService.routePlan.findFirst.mockResolvedValueOnce({
      id: 'route-plan-1',
      companyId: 'company-1',
      promoterId: 'promoter-1',
      routeDate: new Date('2026-04-05T04:00:00.000Z'),
    });
    prismaService.$transaction.mockImplementation(
      async (callback: (input: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    jest.spyOn(routePlansService, 'getRoutePlanDetails').mockResolvedValue({
      id: 'route-plan-1',
      promoter: {
        id: 'promoter-1',
      },
      routeDate: '2026-04-05T04:00:00.000Z',
      status: RoutePlanStatus.PUBLISHED,
      publishedAt: '2026-04-05T05:00:00.000Z',
      stops: [],
    } as never);

    const response = await routePlansService.publishRoutePlan(
      'supervisor-1',
      'route-plan-1',
      {},
    );

    expect(response.status).toBe(RoutePlanStatus.PUBLISHED);
    expect(response.publishedAt).toBe('2026-04-05T05:00:00.000Z');
    const routePlanUpdateCalls = transaction.routePlan.update.mock
      .calls as Array<[RoutePlanUpdateInput]>;
    const routePlanUpdateCall = routePlanUpdateCalls[0]?.[0];

    expect(routePlanUpdateCall).toBeDefined();
    expect(routePlanUpdateCall?.where).toEqual({
      id: 'route-plan-1',
    });
    expect(routePlanUpdateCall?.data.status).toBe(RoutePlanStatus.PUBLISHED);
    expect(routePlanUpdateCall?.data.version).toEqual({
      increment: 1,
    });
    expect(routePlanUpdateCall?.data.lastPublishedByUserId).toBe(
      'supervisor-1',
    );
    expect(routePlanUpdateCall?.data.publishedAt).toBeInstanceOf(Date);

    const notificationCreateCalls = transaction.notification.create.mock
      .calls as Array<[NotificationCreateInput]>;
    const notificationCreateCall = notificationCreateCalls[0]?.[0];

    expect(notificationCreateCall).toBeDefined();
    expect(notificationCreateCall?.data).toMatchObject({
      recipientUserId: 'promoter-1',
      type: NotificationType.ROUTE_PUBLISHED,
    });
  });

  it('materializa o template mensal apenas nos dias elegiveis', async () => {
    prismaService.routeTemplate.findFirst.mockResolvedValue({
      id: 'template-1',
      companyId: 'company-1',
      promoterId: 'promoter-1',
      recurrence: RouteRecurrencePattern.MONTHLY,
      weekdays: [],
      monthDays: [5, 20],
      effectiveFrom: null,
      effectiveUntil: null,
      items: [
        {
          id: 'template-item-1',
          customerId: 'customer-1',
          sequence: 1,
          priority: RouteItemPriority.NORMAL,
          plannedStartTime: '09:00',
          plannedEndTime: '10:00',
          dayOfWeek: null,
          dayOfMonth: 5,
          notes: null,
        },
      ],
    });
    prismaService.routePlan.findFirst.mockResolvedValue(null);
    const createRoutePlanSpy = jest
      .spyOn(routePlansService, 'createRoutePlan')
      .mockImplementation(
        (_actorUserId, dto) =>
          Promise.resolve({
            id: `plan-${dto.routeDate}`,
            routeDate: dto.routeDate,
          }) as never,
      );

    const response = await routePlansService.applyRouteTemplate(
      'supervisor-1',
      'template-1',
      {
        startDate: '2026-04-01',
        endDate: '2026-04-30',
        publishNow: true,
      },
    );

    expect(createRoutePlanSpy).toHaveBeenCalledTimes(1);
    expect(response.count).toBe(1);
    const firstCreateCall = createRoutePlanSpy.mock.calls[0];
    expect(firstCreateCall).toBeDefined();
    expect(firstCreateCall?.[0]).toBe('supervisor-1');
    expect(firstCreateCall?.[1].routeDate).toContain('2026-04-05');
  });

  it('valida somente clientes operacionalmente ativos ao montar roteiro', async () => {
    prismaService.routePlan.findFirst.mockResolvedValue(null);
    prismaService.customer.findMany.mockResolvedValueOnce([
      { id: 'customer-1' },
    ]);

    await expect(
      routePlansService.createRoutePlan('supervisor-1', {
        routeDate: '2026-03-30',
        promoterId: 'promoter-1',
        planningView: RoutePlanningViewMode.DAILY,
        status: RoutePlanStatus.DRAFT,
        items: [
          {
            customerId: 'customer-1',
            sequence: 1,
            priority: RouteItemPriority.NORMAL,
          },
          {
            customerId: 'customer-2',
            sequence: 2,
            priority: RouteItemPriority.NORMAL,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const customerFindManyCalls = prismaService.customer.findMany.mock.calls;
    const customerFindManyCall =
      customerFindManyCalls[0] as CustomerFindManyCall;

    expect(customerFindManyCall).toBeDefined();
    expect(customerFindManyCall[0].where).toMatchObject({
      companyId: 'company-1',
      status: 'ACTIVE',
      active: true,
      deletedAt: null,
      id: {
        in: ['customer-1', 'customer-2'],
      },
    });
    expect(customerFindManyCall[0].select).toEqual({
      id: true,
    });
  });

  it('normaliza routeDate como dia local ao criar roteiro publicado para o promotor', async () => {
    const transaction = {
      routePlan: {
        create: jest.fn().mockResolvedValue({
          id: 'route-plan-1',
        }),
      },
      routePlanItem: {
        create: jest.fn().mockResolvedValue({
          id: 'stop-1',
          client: {
            tradeName: 'Cliente 1',
          },
          sequence: 1,
        }),
      },
      routeChangeLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      notification: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    prismaService.customer.findMany.mockResolvedValueOnce([
      { id: 'customer-1' },
    ]);
    prismaService.routePlan.findFirst.mockResolvedValueOnce(null);
    prismaService.$transaction.mockImplementation(
      async (callback: (input: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    jest.spyOn(routePlansService, 'getRoutePlanDetails').mockResolvedValue({
      id: 'route-plan-1',
      routeDate: '2026-04-05T04:00:00.000Z',
    } as never);

    await routePlansService.createRoutePlan('supervisor-1', {
      routeDate: '2026-04-05',
      promoterId: 'promoter-1',
      planningView: RoutePlanningViewMode.DAILY,
      status: RoutePlanStatus.PUBLISHED,
      publishNow: true,
      items: [
        {
          customerId: 'customer-1',
          sequence: 1,
          priority: RouteItemPriority.NORMAL,
        },
      ],
    });

    const routePlanCreateCalls = transaction.routePlan.create.mock
      .calls as unknown as Array<RoutePlanCreateCall>;
    const createCall = routePlanCreateCalls[0]?.[0];
    if (!createCall) {
      throw new Error('A criacao do roteiro nao foi registrada');
    }
    expect(createCall.data.status).toBe(RoutePlanStatus.PUBLISHED);
    expect(createCall.data.routeDate.toISOString()).toBe(
      '2026-04-05T04:00:00.000Z',
    );
  });

  it('cria roteiro como rascunho quando nenhum status e informado', async () => {
    const transaction = {
      routePlan: {
        create: jest.fn().mockResolvedValue({
          id: 'route-plan-1',
        }),
      },
      routePlanItem: {
        create: jest.fn().mockResolvedValue({
          id: 'stop-1',
          client: {
            tradeName: 'Cliente 1',
          },
          sequence: 1,
        }),
      },
      routeChangeLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      notification: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    prismaService.customer.findMany.mockResolvedValueOnce([
      { id: 'customer-1' },
    ]);
    prismaService.routePlan.findFirst.mockResolvedValueOnce(null);
    prismaService.$transaction.mockImplementation(
      async (callback: (input: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    jest.spyOn(routePlansService, 'getRoutePlanDetails').mockResolvedValue({
      id: 'route-plan-1',
      routeDate: '2026-04-05T04:00:00.000Z',
      status: RoutePlanStatus.DRAFT,
      publishedAt: null,
    } as never);

    await routePlansService.createRoutePlan('supervisor-1', {
      routeDate: '2026-04-05',
      promoterId: 'promoter-1',
      planningView: RoutePlanningViewMode.DAILY,
      items: [
        {
          customerId: 'customer-1',
          sequence: 1,
          priority: RouteItemPriority.NORMAL,
        },
      ],
    });

    const routePlanCreateCalls = transaction.routePlan.create.mock
      .calls as unknown as Array<RoutePlanCreateCall>;
    const createCall = routePlanCreateCalls[0]?.[0];

    if (!createCall) {
      throw new Error('A criacao do roteiro em rascunho nao foi registrada');
    }

    expect(createCall.data.status).toBe(RoutePlanStatus.DRAFT);
  });
});

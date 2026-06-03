import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { EmploymentStatus, UserRole } from '@prisma/client';
import { CollaboratorsService } from './collaborators.service';

describe('CollaboratorsService', () => {
  const userFindUniqueMock = jest.fn();
  const userFindFirstMock = jest.fn();
  const userCountMock = jest.fn();
  const userFindManyMock = jest.fn();
  const userCreateMock = jest.fn();
  const userUpdateMock = jest.fn();
  const promoterCreateMock = jest.fn();
  const promoterUpdateMock = jest.fn();
  const promoterUpdateManyMock = jest.fn();
  const promoterFindManyMock = jest.fn();
  const refreshTokenUpdateManyMock = jest.fn();
  const auditRecordMock = jest.fn();

  const prismaService: {
    user: Record<string, unknown>;
    promoter: Record<string, unknown>;
    refreshToken: Record<string, unknown>;
    $transaction: jest.Mock;
  } = {
    user: {
      findUnique: userFindUniqueMock,
      findFirst: userFindFirstMock,
      findMany: userFindManyMock,
      count: userCountMock,
      create: userCreateMock,
      update: userUpdateMock,
    },
    promoter: {
      create: promoterCreateMock,
      update: promoterUpdateMock,
      updateMany: promoterUpdateManyMock,
      findMany: promoterFindManyMock,
    },
    refreshToken: {
      updateMany: refreshTokenUpdateManyMock,
    },
    $transaction: jest.fn((callback: (transaction: unknown) => unknown) =>
      callback(prismaService),
    ),
  };

  const auditService = {
    record: auditRecordMock,
  };

  let service: CollaboratorsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CollaboratorsService(
      prismaService as never,
      auditService as never,
    );

    userFindUniqueMock.mockResolvedValue({
      id: 'admin-1',
      companyId: 'company-1',
      role: UserRole.ADMIN,
    });
    userCountMock.mockResolvedValue(0);
    userFindManyMock.mockResolvedValue([]);
    promoterFindManyMock.mockResolvedValue([]);
    promoterUpdateManyMock.mockResolvedValue({ count: 0 });
    refreshTokenUpdateManyMock.mockResolvedValue({ count: 1 });
    auditRecordMock.mockResolvedValue(undefined);
  });

  it('cria um promotor com supervisor responsavel e jornada padrao', async () => {
    userFindFirstMock.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        if (where.email === 'promotor.novo@formula.local') {
          return Promise.resolve(null);
        }

        if (where.cpf === '55555555555') {
          return Promise.resolve(null);
        }

        if (where.employeeCode === 'PROM-010') {
          return Promise.resolve(null);
        }

        if (where.id === 'supervisor-1' && where.role === UserRole.SUPERVISOR) {
          return Promise.resolve({ id: 'supervisor-1' });
        }

        if (where.id === 'promoter-10') {
          return Promise.resolve({
            id: 'promoter-10',
            name: 'Promotor Novo',
            email: 'promotor.novo@formula.local',
            phone: '66992000010',
            cpf: '55555555555',
            employeeCode: 'PROM-010',
            role: UserRole.PROMOTER,
            employmentStatus: EmploymentStatus.ACTIVE,
            hireDate: new Date('2026-03-20T00:00:00.000Z'),
            region: 'Rondonopolis Norte',
            notes: 'Novo promotor para equipe norte.',
            active: true,
            promoterProfile: {
              employeeCode: 'PROM-010',
              defaultJourneyStartTime: '08:00',
              defaultJourneyEndTime: '17:00',
              supervisorUser: {
                id: 'supervisor-1',
                name: 'Supervisor Norte',
                email: 'supervisor.norte@formula.local',
              },
            },
            supervisedByMe: [],
          });
        }

        return Promise.resolve(null);
      },
    );
    userCreateMock.mockResolvedValue({
      id: 'promoter-10',
    });
    promoterCreateMock.mockResolvedValue({
      id: 'promoter-10',
    });

    const response = await service.createCollaborator('admin-1', {
      name: 'Promotor Novo',
      email: 'promotor.novo@formula.local',
      phone: '66992000010',
      cpf: '555.555.555-55',
      employeeCode: 'prom-010',
      role: UserRole.PROMOTER,
      status: EmploymentStatus.ACTIVE,
      hireDate: '2026-03-20',
      region: 'Rondonopolis Norte',
      notes: 'Novo promotor para equipe norte.',
      supervisorId: 'supervisor-1',
      defaultJourneyStartTime: '08:00',
      defaultJourneyEndTime: '17:00',
      initialPassword: 'Promotor@123',
    });

    const userCreateCalls = userCreateMock.mock.calls as Array<
      [
        {
          data: {
            role: UserRole;
            employeeCode: string;
            cpf: string;
            active: boolean;
          };
        },
      ]
    >;
    const promoterCreateCalls = promoterCreateMock.mock.calls as Array<
      [
        {
          data: {
            supervisorId: string;
            defaultJourneyStartTime: string;
            defaultJourneyEndTime: string;
          };
        },
      ]
    >;
    const userCreateCall = userCreateCalls[0]?.[0];
    const promoterCreateCall = promoterCreateCalls[0]?.[0];

    expect(userCreateCall?.data).toMatchObject({
      role: UserRole.PROMOTER,
      employeeCode: 'PROM-010',
      cpf: '55555555555',
      active: true,
    });
    expect(promoterCreateCall?.data).toMatchObject({
      supervisorId: 'supervisor-1',
      defaultJourneyStartTime: '08:00',
      defaultJourneyEndTime: '17:00',
    });
    expect(response.supervisorName).toBe('Supervisor Norte');
  });

  it('permite supervisor cadastrar promotor ja vinculado ao proprio escopo', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'supervisor-1',
      companyId: 'company-1',
      role: UserRole.SUPERVISOR,
    });
    userFindFirstMock.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        if (where.email === 'promotor.supervisor@formula.local') {
          return Promise.resolve(null);
        }

        if (where.cpf === '66666666666') {
          return Promise.resolve(null);
        }

        if (where.employeeCode === 'PROM-011') {
          return Promise.resolve(null);
        }

        if (where.id === 'supervisor-1' && where.role === UserRole.SUPERVISOR) {
          return Promise.resolve({ id: 'supervisor-1' });
        }

        if (
          where.id === 'promoter-11' &&
          where.companyId === 'company-1' &&
          where.role === UserRole.PROMOTER
        ) {
          return Promise.resolve({
            id: 'promoter-11',
            name: 'Promotor Supervisor',
            email: 'promotor.supervisor@formula.local',
            phone: '66992000012',
            cpf: '66666666666',
            employeeCode: 'PROM-011',
            role: UserRole.PROMOTER,
            employmentStatus: EmploymentStatus.ACTIVE,
            hireDate: new Date('2026-03-21T00:00:00.000Z'),
            region: 'Leste',
            notes: 'Novo promotor criado pelo supervisor.',
            active: true,
            promoterProfile: {
              employeeCode: 'PROM-011',
              defaultJourneyStartTime: '08:30',
              defaultJourneyEndTime: '17:30',
              supervisorUser: {
                id: 'supervisor-1',
                name: 'Supervisor Norte',
                email: 'supervisor.norte@formula.local',
              },
            },
            supervisedByMe: [],
          });
        }

        return Promise.resolve(null);
      },
    );
    userCreateMock.mockResolvedValue({
      id: 'promoter-11',
    });
    promoterCreateMock.mockResolvedValue({
      id: 'promoter-11',
    });

    await service.createCollaborator('supervisor-1', {
      name: 'Promotor Supervisor',
      email: 'promotor.supervisor@formula.local',
      phone: '66992000012',
      cpf: '666.666.666-66',
      employeeCode: 'prom-011',
      role: UserRole.PROMOTER,
      status: EmploymentStatus.ACTIVE,
      hireDate: '2026-03-21',
      region: 'Leste',
      notes: 'Novo promotor criado pelo supervisor.',
      supervisorId: 'outro-supervisor',
      defaultJourneyStartTime: '08:30',
      defaultJourneyEndTime: '17:30',
      initialPassword: 'Promotor@123',
    });

    const promoterCreateCalls = promoterCreateMock.mock.calls as Array<
      [
        {
          data: {
            supervisorId: string;
          };
        },
      ]
    >;
    const promoterCreateCall = promoterCreateCalls[0]?.[0];

    expect(promoterCreateCall?.data.supervisorId).toBe('supervisor-1');
  });

  it('bloqueia supervisor tentando cadastrar outro supervisor', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'supervisor-1',
      companyId: 'company-1',
      role: UserRole.SUPERVISOR,
    });

    await expect(
      service.createCollaborator('supervisor-1', {
        name: 'Supervisor Invalido',
        email: 'supervisor.invalido@formula.local',
        phone: '66992000013',
        cpf: '777.777.777-77',
        employeeCode: 'SUP-030',
        role: UserRole.SUPERVISOR,
        status: EmploymentStatus.ACTIVE,
        hireDate: '2026-03-22',
        region: 'Sul',
        notes: '',
        teamPromoterIds: [],
        initialPassword: 'Supervisor@123',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia duplicidade de CPF no cadastro', async () => {
    userFindFirstMock.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        if (where.email === 'supervisor.novo@formula.local') {
          return Promise.resolve(null);
        }

        if (where.cpf === '22222222222') {
          return Promise.resolve({ id: 'existing-user' });
        }

        return Promise.resolve(null);
      },
    );

    await expect(
      service.createCollaborator('admin-1', {
        name: 'Supervisor Novo',
        email: 'supervisor.novo@formula.local',
        phone: '66992000011',
        cpf: '222.222.222-22',
        employeeCode: 'SUP-020',
        role: UserRole.SUPERVISOR,
        status: EmploymentStatus.ACTIVE,
        hireDate: '2026-03-20',
        region: 'Sul',
        notes: '',
        teamPromoterIds: [],
        initialPassword: 'Supervisor@123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('nao permite trocar o cargo de um colaborador existente', async () => {
    userFindFirstMock.mockResolvedValue({
      id: 'promoter-1',
      name: 'Promotor Centro',
      email: 'promotor.centro@formula.local',
      phone: '66992000003',
      cpf: '33333333333',
      employeeCode: 'PROM-001',
      role: UserRole.PROMOTER,
      employmentStatus: EmploymentStatus.ACTIVE,
      hireDate: new Date('2025-01-15T00:00:00.000Z'),
      region: 'Centro',
      notes: null,
      active: true,
      promoterProfile: {
        employeeCode: 'PROM-001',
        defaultJourneyStartTime: '08:00',
        defaultJourneyEndTime: '17:00',
        supervisorUser: {
          id: 'supervisor-1',
          name: 'Supervisor',
          email: 'supervisor@formula.local',
        },
      },
      supervisedByMe: [],
    });

    await expect(
      service.updateCollaborator('admin-1', 'promoter-1', {
        name: 'Promotor Centro',
        email: 'promotor.centro@formula.local',
        phone: '66992000003',
        cpf: '333.333.333-33',
        employeeCode: 'PROM-001',
        role: UserRole.SUPERVISOR,
        status: EmploymentStatus.ACTIVE,
        hireDate: '2025-01-15',
        region: 'Centro',
        notes: '',
        teamPromoterIds: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revoga sessoes e desativa o promotor quando o status muda', async () => {
    userFindFirstMock
      .mockResolvedValueOnce({
        id: 'promoter-1',
        name: 'Promotor Centro',
        email: 'promotor.centro@formula.local',
        phone: '66992000003',
        cpf: '33333333333',
        employeeCode: 'PROM-001',
        role: UserRole.PROMOTER,
        employmentStatus: EmploymentStatus.ACTIVE,
        hireDate: new Date('2025-01-15T00:00:00.000Z'),
        region: 'Centro',
        notes: null,
        active: true,
        promoterProfile: {
          employeeCode: 'PROM-001',
          defaultJourneyStartTime: '08:00',
          defaultJourneyEndTime: '17:00',
          supervisorUser: {
            id: 'supervisor-1',
            name: 'Supervisor',
            email: 'supervisor@formula.local',
          },
        },
        supervisedByMe: [],
      })
      .mockResolvedValueOnce({
        id: 'promoter-1',
        name: 'Promotor Centro',
        email: 'promotor.centro@formula.local',
        phone: '66992000003',
        cpf: '33333333333',
        employeeCode: 'PROM-001',
        role: UserRole.PROMOTER,
        employmentStatus: EmploymentStatus.INACTIVE,
        hireDate: new Date('2025-01-15T00:00:00.000Z'),
        region: 'Centro',
        notes: null,
        active: false,
        promoterProfile: {
          employeeCode: 'PROM-001',
          defaultJourneyStartTime: '08:00',
          defaultJourneyEndTime: '17:00',
          supervisorUser: {
            id: 'supervisor-1',
            name: 'Supervisor',
            email: 'supervisor@formula.local',
          },
        },
        supervisedByMe: [],
      });

    const response = await service.updateCollaboratorStatus(
      'admin-1',
      'promoter-1',
      EmploymentStatus.INACTIVE,
    );

    const userUpdateCalls = userUpdateMock.mock.calls as Array<
      [
        {
          data: {
            employmentStatus: EmploymentStatus;
            active: boolean;
          };
        },
      ]
    >;
    const promoterUpdateCalls = promoterUpdateMock.mock.calls as Array<
      [
        {
          data: {
            active: boolean;
          };
        },
      ]
    >;
    const userUpdateCall = userUpdateCalls[0]?.[0];
    const promoterUpdateCall = promoterUpdateCalls[0]?.[0];

    expect(userUpdateCall?.data).toMatchObject({
      employmentStatus: EmploymentStatus.INACTIVE,
      active: false,
    });
    expect(promoterUpdateCall?.data).toMatchObject({
      active: false,
    });
    expect(refreshTokenUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(EmploymentStatus.INACTIVE);
  });
});

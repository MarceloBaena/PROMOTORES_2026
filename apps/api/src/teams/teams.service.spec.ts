import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TeamStatus, UserRole } from '@prisma/client';
import { TeamsService } from './teams.service';

const buildTeamEntity = (overrides?: Partial<Record<string, unknown>>) => ({
  id: 'team-1',
  companyId: 'company-1',
  name: 'Equipe Centro',
  code: 'EQUIPE-CENTRO',
  description: 'Equipe principal da regiao centro.',
  region: 'Centro',
  supervisorUserId: 'supervisor-1',
  supervisorUser: {
    id: 'supervisor-1',
    name: 'Supervisor Centro',
    email: 'supervisor.centro@formula.local',
  },
  status: TeamStatus.ACTIVE,
  active: true,
  members: [
    {
      id: 'member-1',
      promoterId: 'promoter-1',
      createdAt: new Date('2026-04-01T10:00:00.000Z'),
      promoter: {
        id: 'promoter-1',
        employeeCode: 'PROM-001',
        active: true,
        supervisorUser: {
          id: 'supervisor-1',
          name: 'Supervisor Centro',
        },
        user: {
          id: 'promoter-1',
          name: 'Promotor Centro',
          email: 'promotor.centro@formula.local',
          region: 'Centro',
          employmentStatus: 'ACTIVE',
          active: true,
        },
      },
    },
  ],
  _count: {
    members: 1,
  },
  createdAt: new Date('2026-04-01T09:00:00.000Z'),
  updatedAt: new Date('2026-04-01T09:30:00.000Z'),
  ...overrides,
});

describe('TeamsService', () => {
  const userFindUniqueMock = jest.fn();
  const userFindFirstMock = jest.fn();
  const promoterFindManyMock = jest.fn();
  const teamCountMock = jest.fn();
  const teamFindManyMock = jest.fn();
  const teamFindFirstMock = jest.fn();
  const teamCreateMock = jest.fn();
  const teamUpdateMock = jest.fn();
  const teamMemberFindManyMock = jest.fn();
  const teamMemberCreateManyMock = jest.fn();
  const teamMemberDeleteManyMock = jest.fn();
  const teamMemberFindFirstMock = jest.fn();
  const teamMemberDeleteMock = jest.fn();
  const auditRecordMock = jest.fn();

  const prismaService: Record<string, unknown> = {
    user: {
      findUnique: userFindUniqueMock,
      findFirst: userFindFirstMock,
    },
    promoter: {
      findMany: promoterFindManyMock,
    },
    team: {
      count: teamCountMock,
      findMany: teamFindManyMock,
      findFirst: teamFindFirstMock,
      create: teamCreateMock,
      update: teamUpdateMock,
    },
    teamMember: {
      findMany: teamMemberFindManyMock,
      createMany: teamMemberCreateManyMock,
      deleteMany: teamMemberDeleteManyMock,
      findFirst: teamMemberFindFirstMock,
      delete: teamMemberDeleteMock,
    },
    $transaction: jest.fn((callback: (transaction: unknown) => unknown) =>
      callback(prismaService),
    ),
  };

  const auditService = {
    record: auditRecordMock,
  };

  let service: TeamsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TeamsService(prismaService as never, auditService as never);

    userFindUniqueMock.mockResolvedValue({
      id: 'admin-1',
      companyId: 'company-1',
      role: UserRole.ADMIN,
      name: 'Admin Formula',
      region: 'Cuiaba',
    });
    teamCountMock.mockResolvedValue(0);
    teamFindManyMock.mockResolvedValue([]);
    teamMemberFindManyMock.mockResolvedValue([]);
    teamMemberCreateManyMock.mockResolvedValue({ count: 0 });
    teamMemberDeleteManyMock.mockResolvedValue({ count: 0 });
    teamMemberDeleteMock.mockResolvedValue(undefined);
    auditRecordMock.mockResolvedValue(undefined);
  });

  it('cria uma equipe com supervisor responsavel e promotores vinculados', async () => {
    userFindFirstMock.mockResolvedValue({
      id: 'supervisor-1',
      name: 'Supervisor Centro',
      region: 'Centro',
    });
    teamFindFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce(
      buildTeamEntity({
        members: [
          buildTeamEntity().members[0],
          {
            id: 'member-2',
            promoterId: 'promoter-2',
            createdAt: new Date('2026-04-01T10:01:00.000Z'),
            promoter: {
              id: 'promoter-2',
              employeeCode: 'PROM-002',
              active: true,
              supervisorUser: {
                id: 'supervisor-1',
                name: 'Supervisor Centro',
              },
              user: {
                id: 'promoter-2',
                name: 'Promotor Norte',
                email: 'promotor.norte@formula.local',
                region: 'Centro',
                employmentStatus: 'ACTIVE',
                active: true,
              },
            },
          },
        ],
        _count: { members: 2 },
      }),
    );
    promoterFindManyMock.mockResolvedValue([
      {
        id: 'promoter-1',
        supervisorId: 'supervisor-1',
        user: {
          id: 'promoter-1',
          name: 'Promotor Centro',
        },
      },
      {
        id: 'promoter-2',
        supervisorId: 'supervisor-1',
        user: {
          id: 'promoter-2',
          name: 'Promotor Norte',
        },
      },
    ]);
    teamCreateMock.mockResolvedValue({
      id: 'team-1',
    });

    const response = await service.createTeam('admin-1', {
      name: 'Equipe Centro',
      code: 'eq-centro',
      description: 'Equipe principal da regiao centro.',
      region: 'Centro',
      supervisorUserId: 'supervisor-1',
      status: TeamStatus.ACTIVE,
      promoterIds: ['promoter-1', 'promoter-2'],
    });

    expect(teamCreateMock).toHaveBeenCalledTimes(1);
    const createCalls = teamCreateMock.mock.calls as Array<[unknown]>;
    expect(createCalls[0]?.[0]).toMatchObject({
      data: {
        name: 'Equipe Centro',
        code: 'EQ-CENTRO',
        supervisorUserId: 'supervisor-1',
        status: TeamStatus.ACTIVE,
        active: true,
      },
    });
    expect(teamMemberCreateManyMock).toHaveBeenCalledWith({
      data: [
        { teamId: 'team-1', promoterId: 'promoter-1' },
        { teamId: 'team-1', promoterId: 'promoter-2' },
      ],
    });
    expect(response.promotersCount).toBe(2);
    expect(response.supervisorName).toBe('Supervisor Centro');
  });

  it('bloqueia supervisor tentando criar equipe para outro supervisor', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'supervisor-1',
      companyId: 'company-1',
      role: UserRole.SUPERVISOR,
      name: 'Supervisor Centro',
      region: 'Centro',
    });

    await expect(
      service.createTeam('supervisor-1', {
        name: 'Equipe Centro',
        code: 'EQUIPE-CENTRO',
        description: 'Equipe principal da regiao centro.',
        region: 'Centro',
        supervisorUserId: 'supervisor-2',
        status: TeamStatus.ACTIVE,
        promoterIds: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia promotor que ja pertence a outra equipe', async () => {
    userFindFirstMock.mockResolvedValue({
      id: 'supervisor-1',
      name: 'Supervisor Centro',
      region: 'Centro',
    });
    teamFindFirstMock.mockResolvedValue(null);
    promoterFindManyMock.mockResolvedValue([
      {
        id: 'promoter-1',
        supervisorId: 'supervisor-1',
        user: {
          id: 'promoter-1',
          name: 'Promotor Centro',
        },
      },
    ]);
    teamMemberFindManyMock.mockResolvedValue([
      {
        promoterId: 'promoter-1',
        team: {
          id: 'team-9',
          name: 'Equipe Norte',
          code: 'EQUIPE-NORTE',
        },
      },
    ]);

    await expect(
      service.createTeam('admin-1', {
        name: 'Equipe Centro',
        code: 'EQUIPE-CENTRO',
        description: 'Equipe principal da regiao centro.',
        region: 'Centro',
        supervisorUserId: 'supervisor-1',
        status: TeamStatus.ACTIVE,
        promoterIds: ['promoter-1'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('atualiza o status da equipe e mantem active coerente', async () => {
    teamFindFirstMock.mockResolvedValue(
      buildTeamEntity({
        status: TeamStatus.ACTIVE,
        active: true,
      }),
    );
    teamUpdateMock.mockResolvedValue({
      id: 'team-1',
      status: TeamStatus.INACTIVE,
      active: false,
      updatedAt: new Date('2026-04-01T11:00:00.000Z'),
    });

    const response = await service.updateTeamStatus(
      'admin-1',
      'team-1',
      TeamStatus.INACTIVE,
    );

    expect(teamUpdateMock).toHaveBeenCalledWith({
      where: {
        id: 'team-1',
      },
      data: {
        status: TeamStatus.INACTIVE,
        active: false,
      },
    });
    expect(response.status).toBe(TeamStatus.INACTIVE);
    expect(response.active).toBe(false);
  });
});

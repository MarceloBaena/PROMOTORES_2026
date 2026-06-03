import type { Server } from 'node:http';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { CollaboratorsController } from '../src/collaborators/collaborators.controller';
import { CollaboratorsService } from '../src/collaborators/collaborators.service';
import { JwtAuthGuard } from '../src/common/jwt-auth.guard';
import { RolesGuard } from '../src/common/roles.guard';

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: {
        userId: string;
        email: string;
        name: string;
        role: UserRole;
      };
    }>();
    const roleHeader = request.headers['x-test-role'];
    const role =
      roleHeader === UserRole.SUPERVISOR ? UserRole.SUPERVISOR : UserRole.ADMIN;

    request.user = {
      userId: role === UserRole.ADMIN ? 'admin-1' : 'supervisor-1',
      email:
        role === UserRole.ADMIN
          ? 'admin@formula.local'
          : 'supervisor@formula.local',
      name: role === UserRole.ADMIN ? 'Admin' : 'Supervisor',
      role,
    };

    return true;
  }
}

describe('CollaboratorsController (e2e)', () => {
  const listCollaboratorsMock = jest.fn();
  const getCollaboratorDetailsMock = jest.fn();
  const createCollaboratorMock = jest.fn();
  const updateCollaboratorMock = jest.fn();
  const updateCollaboratorStatusMock = jest.fn();
  const resetCollaboratorPasswordMock = jest.fn();

  const collaboratorsService = {
    listCollaborators: listCollaboratorsMock,
    getCollaboratorDetails: getCollaboratorDetailsMock,
    createCollaborator: createCollaboratorMock,
    updateCollaborator: updateCollaboratorMock,
    updateCollaboratorStatus: updateCollaboratorStatusMock,
    resetCollaboratorPassword: resetCollaboratorPasswordMock,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    listCollaboratorsMock.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'promoter-1',
          name: 'Promotor Centro',
          email: 'promotor.centro@formula.local',
          phone: '66992000003',
          cpf: '33333333333',
          employeeCode: 'PROM-001',
          role: UserRole.PROMOTER,
          status: 'ACTIVE',
          hireDate: '2025-01-15T00:00:00.000Z',
          region: 'Centro',
          notes: null,
          active: true,
          supervisorId: 'supervisor-1',
          supervisorName: 'Supervisor',
          defaultJourneyStartTime: '08:00',
          defaultJourneyEndTime: '17:00',
          teamSize: 0,
        },
      ],
    });
    getCollaboratorDetailsMock.mockResolvedValue({
      id: 'promoter-1',
      name: 'Promotor Centro',
      email: 'promotor.centro@formula.local',
      phone: '66992000003',
      cpf: '33333333333',
      employeeCode: 'PROM-001',
      role: UserRole.PROMOTER,
      status: 'ACTIVE',
      hireDate: '2025-01-15T00:00:00.000Z',
      region: 'Centro',
      notes: null,
      active: true,
      supervisorId: 'supervisor-1',
      supervisorName: 'Supervisor',
      defaultJourneyStartTime: '08:00',
      defaultJourneyEndTime: '17:00',
      teamSize: 0,
      teamPromoterIds: [],
      teamPromoters: [],
    });
    createCollaboratorMock.mockImplementation(
      (actorUserId: string, payload: { role?: UserRole }) => {
        if (
          actorUserId === 'supervisor-1' &&
          payload.role === UserRole.SUPERVISOR
        ) {
          throw new ForbiddenException(
            'Supervisor pode cadastrar apenas promotores sob sua responsabilidade.',
          );
        }

        return {
          id: 'promoter-1',
        };
      },
    );
    updateCollaboratorMock.mockResolvedValue({
      id: 'promoter-1',
    });
    updateCollaboratorStatusMock.mockResolvedValue({
      id: 'promoter-1',
      status: 'INACTIVE',
    });
    resetCollaboratorPasswordMock.mockResolvedValue({
      id: 'promoter-1',
      passwordReset: true,
    });
  });

  const createApp = async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [CollaboratorsController],
      providers: [
        RolesGuard,
        {
          provide: CollaboratorsService,
          useValue: collaboratorsService,
        },
        {
          provide: JwtAuthGuard,
          useClass: TestJwtAuthGuard,
        },
      ],
    });
    const moduleRef = await moduleBuilder
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtAuthGuard)
      .compile();

    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    return app;
  };

  it('permite que admin liste e crie colaboradores', async () => {
    const app = await createApp();

    try {
      await request(app.getHttpServer() as Server)
        .get('/collaborators')
        .set('x-test-role', 'ADMIN')
        .expect(200);

      await request(app.getHttpServer() as Server)
        .post('/collaborators')
        .set('x-test-role', 'ADMIN')
        .send({
          name: 'Promotor Novo',
          email: 'promotor.novo@formula.local',
          phone: '66992000010',
          cpf: '555.555.555-55',
          employeeCode: 'PROM-010',
          role: 'PROMOTER',
          status: 'ACTIVE',
          hireDate: '2026-03-20',
          region: 'Norte',
          notes: 'Novo promotor',
          supervisorId: 'supervisor-1',
          defaultJourneyStartTime: '08:00',
          defaultJourneyEndTime: '17:00',
          initialPassword: 'Promotor@123',
        })
        .expect(201);

      expect(listCollaboratorsMock).toHaveBeenCalledTimes(1);
      expect(createCollaboratorMock).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('permite supervisor listar e cadastrar promotor do proprio escopo', async () => {
    const app = await createApp();

    try {
      await request(app.getHttpServer() as Server)
        .get('/collaborators')
        .set('x-test-role', 'SUPERVISOR')
        .expect(200);

      await request(app.getHttpServer() as Server)
        .post('/collaborators')
        .set('x-test-role', 'SUPERVISOR')
        .send({
          name: 'Promotor Equipe',
          email: 'promotor.equipe@formula.local',
          phone: '66992000015',
          cpf: '888.888.888-88',
          employeeCode: 'PROM-015',
          role: 'PROMOTER',
          status: 'ACTIVE',
          hireDate: '2026-03-20',
          region: 'Norte',
          notes: 'Novo promotor da equipe',
          supervisorId: 'supervisor-qualquer',
          defaultJourneyStartTime: '08:00',
          defaultJourneyEndTime: '17:00',
          initialPassword: 'Promotor@123',
        })
        .expect(201);

      await request(app.getHttpServer() as Server)
        .post('/collaborators')
        .set('x-test-role', 'SUPERVISOR')
        .send({
          name: 'Supervisor Invalido',
          email: 'supervisor.invalido@formula.local',
          phone: '66992000016',
          cpf: '999.999.999-99',
          employeeCode: 'SUP-099',
          role: 'SUPERVISOR',
          status: 'ACTIVE',
          hireDate: '2026-03-20',
          region: 'Norte',
          notes: 'Nao deveria passar',
          initialPassword: 'Supervisor@123',
        })
        .expect(403);
    } finally {
      await app.close();
    }
  });

  it('valida payload obrigatorio do cadastro', async () => {
    const app = await createApp();

    try {
      await request(app.getHttpServer() as Server)
        .post('/collaborators')
        .set('x-test-role', 'ADMIN')
        .send({
          name: '',
          email: 'email-invalido',
        })
        .expect(400);
    } finally {
      await app.close();
    }
  });
});

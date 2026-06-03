import { hash } from 'bcryptjs';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditEntityType,
  EmploymentStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateCollaboratorDto,
  ListCollaboratorsQueryDto,
  UpdateCollaboratorDto,
} from './collaborators.dto';

const managedRoles = [UserRole.PROMOTER, UserRole.SUPERVISOR] as const;

type ManagedRole = (typeof managedRoles)[number];
type TransactionClient = Prisma.TransactionClient;
type ActorContext = {
  id: string;
  companyId: string;
  role: UserRole;
};

@Injectable()
export class CollaboratorsService {
  private readonly logger = new Logger(CollaboratorsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listCollaborators(
    actorUserId: string,
    query: ListCollaboratorsQueryDto,
  ) {
    const actor = await this.getActorContext(actorUserId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const sortDirection = query.sortDirection ?? 'asc';
    const sortBy = this.resolveSortField(query.sortBy, sortDirection);
    const search = query.search?.trim();
    const normalizedSearchDigits = search ? this.normalizeDigits(search) : '';
    const collaboratorRoleFilter =
      actor.role === UserRole.SUPERVISOR
        ? UserRole.PROMOTER
        : query.role
          ? query.role
          : {
              in: [...managedRoles],
            };
    const supervisedPromoterId =
      actor.role === UserRole.SUPERVISOR ? actor.id : query.supervisorId;
    const where: Prisma.UserWhereInput = {
      companyId: actor.companyId,
      deletedAt: null,
      role: collaboratorRoleFilter,
      employmentStatus: query.status,
      region: query.region
        ? {
            contains: query.region.trim(),
            mode: 'insensitive',
          }
        : undefined,
      promoterProfile: supervisedPromoterId
        ? {
            supervisorId: supervisedPromoterId,
            deletedAt: null,
          }
        : undefined,
      OR: search
        ? [
            {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              email: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              employeeCode: {
                contains: search,
                mode: 'insensitive',
              },
            },
            ...(normalizedSearchDigits
              ? [
                  {
                    cpf: {
                      contains: normalizedSearchDigits,
                    },
                  },
                ]
              : []),
          ]
        : undefined,
    };

    const [total, items] = await Promise.all([
      this.prismaService.user.count({ where }),
      this.prismaService.user.findMany({
        where,
        include: {
          promoterProfile: {
            include: {
              supervisorUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          supervisedByMe: {
            where: {
              deletedAt: null,
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  active: true,
                },
              },
            },
            orderBy: {
              user: {
                name: 'asc',
              },
            },
          },
        },
        orderBy: sortBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((item) => this.mapCollaboratorSummary(item)),
    };
  }

  async getCollaboratorDetails(actorUserId: string, collaboratorId: string) {
    const actor = await this.getActorContext(actorUserId);
    const collaborator = await this.findManagedCollaboratorOrThrow(
      actor,
      collaboratorId,
    );

    return this.mapCollaboratorDetail(collaborator);
  }

  async createCollaborator(actorUserId: string, dto: CreateCollaboratorDto) {
    const actor = await this.getActorContext(actorUserId);
    let payload = this.normalizePayload(dto);

    if (actor.role === UserRole.SUPERVISOR) {
      if (payload.role !== UserRole.PROMOTER) {
        throw new ForbiddenException(
          'Supervisor pode cadastrar apenas promotores sob sua responsabilidade.',
        );
      }

      payload = {
        ...payload,
        supervisorId: actor.id,
        teamPromoterIds: undefined,
      };
    }

    await this.assertUniqueIdentityFields(actor.companyId, payload);
    await this.assertRoleSpecificRules(
      actor.companyId,
      payload.role,
      payload.supervisorId,
      payload.teamPromoterIds,
    );

    try {
      const created = await this.prismaService.$transaction(
        async (transaction) => {
          const user = await transaction.user.create({
            data: {
              companyId: actor.companyId,
              role: payload.role,
              name: payload.name,
              email: payload.email,
              phone: payload.phone,
              cpf: payload.cpf,
              employeeCode: payload.employeeCode,
              passwordHash: await hash(dto.initialPassword, 12),
              employmentStatus: payload.status,
              hireDate: payload.hireDate,
              region: payload.region,
              notes: payload.notes,
              active: payload.status === EmploymentStatus.ACTIVE,
            },
          });

          if (payload.role === UserRole.PROMOTER) {
            await transaction.promoter.create({
              data: {
                id: user.id,
                companyId: actor.companyId,
                employeeCode: payload.employeeCode,
                supervisorId: payload.supervisorId,
                hireDate: payload.hireDate,
                defaultJourneyStartTime: payload.defaultJourneyStartTime,
                defaultJourneyEndTime: payload.defaultJourneyEndTime,
                active: payload.status === EmploymentStatus.ACTIVE,
              },
            });
          }

          if (
            payload.role === UserRole.SUPERVISOR &&
            payload.teamPromoterIds !== undefined
          ) {
            await this.syncSupervisorTeam(
              transaction,
              actor.companyId,
              user.id,
              payload.teamPromoterIds,
            );
          }

          return user;
        },
      );

      await this.auditService.record(
        actorUserId,
        AuditEntityType.USER,
        created.id,
        'collaborator.create',
        {
          role: payload.role,
          status: payload.status,
          employeeCode: payload.employeeCode,
        },
      );

      this.logger.log(
        `Colaborador criado actorUserId=${actorUserId} collaboratorId=${created.id} role=${payload.role}`,
      );

      return this.getCollaboratorDetails(actorUserId, created.id);
    } catch (error) {
      this.rethrowKnownConstraintError(error);
      throw error;
    }
  }

  async updateCollaborator(
    actorUserId: string,
    collaboratorId: string,
    dto: UpdateCollaboratorDto,
  ) {
    const actor = await this.getActorContext(actorUserId);
    const existing = await this.findManagedCollaboratorOrThrow(
      actor,
      collaboratorId,
    );

    if (existing.role !== dto.role) {
      throw new BadRequestException(
        'Nao e permitido alterar o cargo do colaborador. Cadastre um novo usuario para trocar entre promotor e supervisor.',
      );
    }

    let payload = this.normalizePayload(dto);

    if (actor.role === UserRole.SUPERVISOR) {
      if (payload.role !== UserRole.PROMOTER) {
        throw new ForbiddenException(
          'Supervisor pode ajustar apenas promotores sob sua responsabilidade.',
        );
      }

      payload = {
        ...payload,
        supervisorId: actor.id,
        teamPromoterIds: undefined,
      };
    }

    await this.assertUniqueIdentityFields(
      actor.companyId,
      payload,
      collaboratorId,
    );
    await this.assertRoleSpecificRules(
      actor.companyId,
      payload.role,
      payload.supervisorId,
      payload.teamPromoterIds,
      collaboratorId,
    );

    try {
      await this.prismaService.$transaction(async (transaction) => {
        await transaction.user.update({
          where: {
            id: collaboratorId,
          },
          data: {
            name: payload.name,
            email: payload.email,
            phone: payload.phone,
            cpf: payload.cpf,
            employeeCode: payload.employeeCode,
            employmentStatus: payload.status,
            hireDate: payload.hireDate,
            region: payload.region,
            notes: payload.notes,
            active: payload.status === EmploymentStatus.ACTIVE,
          },
        });

        if (existing.role === UserRole.PROMOTER) {
          await transaction.promoter.update({
            where: {
              id: collaboratorId,
            },
            data: {
              employeeCode: payload.employeeCode,
              supervisorId: payload.supervisorId,
              hireDate: payload.hireDate,
              defaultJourneyStartTime: payload.defaultJourneyStartTime,
              defaultJourneyEndTime: payload.defaultJourneyEndTime,
              active: payload.status === EmploymentStatus.ACTIVE,
            },
          });
        }

        if (
          existing.role === UserRole.SUPERVISOR &&
          payload.teamPromoterIds !== undefined
        ) {
          await this.syncSupervisorTeam(
            transaction,
            actor.companyId,
            collaboratorId,
            payload.teamPromoterIds,
          );
        }

        if (payload.status !== EmploymentStatus.ACTIVE) {
          await transaction.refreshToken.updateMany({
            where: {
              userId: collaboratorId,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          });
        }
      });

      await this.auditService.record(
        actorUserId,
        AuditEntityType.USER,
        collaboratorId,
        'collaborator.update',
        {
          role: payload.role,
          status: payload.status,
          employeeCode: payload.employeeCode,
        },
      );

      this.logger.log(
        `Colaborador atualizado actorUserId=${actorUserId} collaboratorId=${collaboratorId}`,
      );

      return this.getCollaboratorDetails(actorUserId, collaboratorId);
    } catch (error) {
      this.rethrowKnownConstraintError(error);
      throw error;
    }
  }

  async updateCollaboratorStatus(
    actorUserId: string,
    collaboratorId: string,
    status: EmploymentStatus,
  ) {
    const actor = await this.getActorContext(actorUserId);
    const collaborator = await this.findManagedCollaboratorOrThrow(
      actor,
      collaboratorId,
    );
    const active = status === EmploymentStatus.ACTIVE;

    await this.prismaService.$transaction(async (transaction) => {
      await transaction.user.update({
        where: {
          id: collaboratorId,
        },
        data: {
          employmentStatus: status,
          active,
        },
      });

      if (collaborator.role === UserRole.PROMOTER) {
        await transaction.promoter.update({
          where: {
            id: collaboratorId,
          },
          data: {
            active,
          },
        });
      }

      await transaction.refreshToken.updateMany({
        where: {
          userId: collaboratorId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    });

    await this.auditService.record(
      actorUserId,
      AuditEntityType.USER,
      collaboratorId,
      'collaborator.status',
      {
        previousStatus: collaborator.employmentStatus,
        nextStatus: status,
      },
    );

    this.logger.log(
      `Status do colaborador alterado actorUserId=${actorUserId} collaboratorId=${collaboratorId} status=${status}`,
    );

    return this.getCollaboratorDetails(actorUserId, collaboratorId);
  }

  async resetCollaboratorPassword(
    actorUserId: string,
    collaboratorId: string,
    newPassword: string,
  ) {
    const actor = await this.getActorContext(actorUserId);
    await this.findManagedCollaboratorOrThrow(actor, collaboratorId);

    await this.prismaService.$transaction(async (transaction) => {
      await transaction.user.update({
        where: {
          id: collaboratorId,
        },
        data: {
          passwordHash: await hash(newPassword, 12),
        },
      });

      await transaction.refreshToken.updateMany({
        where: {
          userId: collaboratorId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    });

    await this.auditService.record(
      actorUserId,
      AuditEntityType.USER,
      collaboratorId,
      'collaborator.reset-password',
      {},
    );

    this.logger.log(
      `Senha redefinida actorUserId=${actorUserId} collaboratorId=${collaboratorId}`,
    );

    return {
      id: collaboratorId,
      passwordReset: true,
    };
  }

  private resolveSortField(
    sortBy?: string,
    sortDirection: Prisma.SortOrder = 'asc',
  ): Prisma.UserOrderByWithRelationInput {
    switch (sortBy) {
      case 'hireDate':
        return { hireDate: sortDirection };
      case 'region':
        return { region: sortDirection };
      case 'employeeCode':
        return { employeeCode: sortDirection };
      default:
        return { name: sortDirection };
    }
  }

  private normalizePayload(dto: CreateCollaboratorDto | UpdateCollaboratorDto) {
    return {
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone.trim(),
      cpf: this.normalizeDigits(dto.cpf),
      employeeCode: dto.employeeCode.trim().toUpperCase(),
      role: dto.role,
      status: dto.status,
      hireDate: new Date(dto.hireDate),
      region: dto.region.trim(),
      notes: dto.notes?.trim() || null,
      supervisorId:
        dto.role === UserRole.PROMOTER ? dto.supervisorId?.trim() : undefined,
      defaultJourneyStartTime:
        dto.role === UserRole.PROMOTER
          ? dto.defaultJourneyStartTime?.trim() || null
          : null,
      defaultJourneyEndTime:
        dto.role === UserRole.PROMOTER
          ? dto.defaultJourneyEndTime?.trim() || null
          : null,
      teamPromoterIds:
        dto.role === UserRole.SUPERVISOR
          ? [...new Set(dto.teamPromoterIds ?? [])]
          : undefined,
    };
  }

  private async getActorContext(actorUserId: string): Promise<ActorContext> {
    const actor = await this.prismaService.user.findUnique({
      where: {
        id: actorUserId,
      },
      select: {
        id: true,
        companyId: true,
        role: true,
      },
    });

    if (!actor) {
      throw new NotFoundException('Usuario autenticado nao encontrado');
    }

    return actor;
  }

  private buildManagedCollaboratorWhere(
    actor: ActorContext,
    collaboratorId: string,
  ): Prisma.UserWhereInput {
    const baseWhere: Prisma.UserWhereInput = {
      id: collaboratorId,
      companyId: actor.companyId,
      deletedAt: null,
    };

    if (actor.role === UserRole.SUPERVISOR) {
      return {
        ...baseWhere,
        role: UserRole.PROMOTER,
        promoterProfile: {
          supervisorId: actor.id,
          deletedAt: null,
        },
      };
    }

    return {
      ...baseWhere,
      role: {
        in: [...managedRoles],
      },
    };
  }

  private async findManagedCollaboratorOrThrow(
    actor: ActorContext,
    collaboratorId: string,
  ) {
    const collaborator = await this.prismaService.user.findFirst({
      where: this.buildManagedCollaboratorWhere(actor, collaboratorId),
      include: {
        promoterProfile: {
          include: {
            supervisorUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        supervisedByMe: {
          where: {
            deletedAt: null,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                employeeCode: true,
                active: true,
              },
            },
          },
          orderBy: {
            user: {
              name: 'asc',
            },
          },
        },
      },
    });

    if (!collaborator) {
      throw new NotFoundException('Colaborador nao encontrado');
    }

    return collaborator;
  }

  private async assertUniqueIdentityFields(
    companyId: string,
    payload: ReturnType<CollaboratorsService['normalizePayload']>,
    collaboratorId?: string,
  ) {
    const [emailOwner, cpfOwner, employeeCodeOwner] = await Promise.all([
      this.prismaService.user.findFirst({
        where: {
          companyId,
          deletedAt: null,
          email: payload.email,
          id: collaboratorId ? { not: collaboratorId } : undefined,
        },
        select: {
          id: true,
        },
      }),
      this.prismaService.user.findFirst({
        where: {
          companyId,
          deletedAt: null,
          cpf: payload.cpf,
          id: collaboratorId ? { not: collaboratorId } : undefined,
        },
        select: {
          id: true,
        },
      }),
      this.prismaService.user.findFirst({
        where: {
          companyId,
          deletedAt: null,
          employeeCode: payload.employeeCode,
          id: collaboratorId ? { not: collaboratorId } : undefined,
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (emailOwner) {
      throw new ConflictException('Ja existe colaborador com esse email');
    }

    if (cpfOwner) {
      throw new ConflictException('Ja existe colaborador com esse CPF');
    }

    if (employeeCodeOwner) {
      throw new ConflictException('Ja existe colaborador com essa matricula');
    }
  }

  private async assertRoleSpecificRules(
    companyId: string,
    role: ManagedRole,
    supervisorId?: string,
    teamPromoterIds?: string[],
    collaboratorId?: string,
  ) {
    if (role === UserRole.PROMOTER) {
      if (!supervisorId) {
        throw new BadRequestException(
          'Promotor precisa ter um supervisor responsavel',
        );
      }

      const supervisor = await this.prismaService.user.findFirst({
        where: {
          id: supervisorId,
          companyId,
          role: UserRole.SUPERVISOR,
          active: true,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!supervisor) {
        throw new NotFoundException('Supervisor responsavel nao encontrado');
      }
    }

    if (role === UserRole.SUPERVISOR && teamPromoterIds !== undefined) {
      const validPromoters = await this.prismaService.promoter.findMany({
        where: {
          companyId,
          id: {
            in: teamPromoterIds,
            not: collaboratorId,
          },
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (validPromoters.length !== teamPromoterIds.length) {
        throw new NotFoundException(
          'A equipe vinculada possui promotores invalidos',
        );
      }
    }
  }

  private async syncSupervisorTeam(
    transaction: TransactionClient,
    companyId: string,
    supervisorId: string,
    desiredPromoterIds: string[],
  ) {
    const uniquePromoterIds = [...new Set(desiredPromoterIds)];

    if (uniquePromoterIds.length > 0) {
      const promoters = await transaction.promoter.findMany({
        where: {
          companyId,
          id: {
            in: uniquePromoterIds,
          },
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (promoters.length !== uniquePromoterIds.length) {
        throw new NotFoundException(
          'A equipe vinculada possui promotores invalidos',
        );
      }
    }

    await transaction.promoter.updateMany({
      where: {
        companyId,
        supervisorId,
        id:
          uniquePromoterIds.length > 0
            ? {
                notIn: uniquePromoterIds,
              }
            : undefined,
      },
      data: {
        supervisorId: uniquePromoterIds.length > 0 ? null : null,
      },
    });

    if (uniquePromoterIds.length > 0) {
      await transaction.promoter.updateMany({
        where: {
          companyId,
          id: {
            in: uniquePromoterIds,
          },
        },
        data: {
          supervisorId,
        },
      });
    }
  }

  private mapCollaboratorSummary(
    collaborator: Awaited<
      ReturnType<CollaboratorsService['findManagedCollaboratorOrThrow']>
    >,
  ) {
    return {
      id: collaborator.id,
      name: collaborator.name,
      email: collaborator.email,
      phone: collaborator.phone,
      cpf: collaborator.cpf,
      employeeCode:
        collaborator.promoterProfile?.employeeCode ?? collaborator.employeeCode,
      role: collaborator.role,
      status: collaborator.employmentStatus,
      hireDate: collaborator.hireDate?.toISOString() ?? null,
      region: collaborator.region,
      notes: collaborator.notes,
      active: collaborator.active,
      supervisorId: collaborator.promoterProfile?.supervisorUser?.id ?? null,
      supervisorName:
        collaborator.promoterProfile?.supervisorUser?.name ?? null,
      defaultJourneyStartTime:
        collaborator.promoterProfile?.defaultJourneyStartTime ?? null,
      defaultJourneyEndTime:
        collaborator.promoterProfile?.defaultJourneyEndTime ?? null,
      teamSize:
        collaborator.role === UserRole.SUPERVISOR
          ? collaborator.supervisedByMe.length
          : 0,
    };
  }

  private mapCollaboratorDetail(
    collaborator: Awaited<
      ReturnType<CollaboratorsService['findManagedCollaboratorOrThrow']>
    >,
  ) {
    return {
      ...this.mapCollaboratorSummary(collaborator),
      teamPromoterIds:
        collaborator.role === UserRole.SUPERVISOR
          ? collaborator.supervisedByMe.map((item) => item.id)
          : [],
      teamPromoters:
        collaborator.role === UserRole.SUPERVISOR
          ? collaborator.supervisedByMe.map((item) => ({
              id: item.id,
              name: item.user.name,
              email: item.user.email,
              employeeCode: item.employeeCode,
              active: item.active,
            }))
          : [],
    };
  }

  private normalizeDigits(value: string) {
    return value.replace(/\D/g, '');
  }

  private rethrowKnownConstraintError(error: unknown): never | void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Ja existe colaborador com email, CPF ou matricula informados',
      );
    }
  }
}

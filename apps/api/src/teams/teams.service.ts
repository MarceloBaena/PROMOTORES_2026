import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditEntityType, Prisma, TeamStatus, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateTeamDto,
  ListTeamsQueryDto,
  UpdateTeamDto,
  UpdateTeamMembersDto,
} from './teams.dto';

type ActorContext = {
  userId: string;
  companyId: string;
  role: UserRole;
  name: string;
  region: string | null;
};

type TeamEntity = Prisma.TeamGetPayload<{
  include: {
    supervisorUser: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
    members: {
      include: {
        promoter: {
          include: {
            user: {
              select: {
                id: true;
                name: true;
                email: true;
                region: true;
                employmentStatus: true;
                active: true;
              };
            };
            supervisorUser: {
              select: {
                id: true;
                name: true;
              };
            };
          };
        };
      };
    };
    _count: {
      select: {
        members: true;
      };
    };
  };
}>;

type SupervisorReference = {
  id: string;
  name: string;
  region: string | null;
};

type PromoterReference = {
  id: string;
  name: string;
  supervisorId: string | null;
};

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listTeams(actorUserId: string, query: ListTeamsQueryDto) {
    const actor = await this.getActorContext(actorUserId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const search = query.search?.trim();
    const where: Prisma.TeamWhereInput = {
      companyId: actor.companyId,
      code: query.code
        ? {
            contains: query.code.trim(),
            mode: 'insensitive',
          }
        : undefined,
      region: query.region
        ? {
            contains: query.region.trim(),
            mode: 'insensitive',
          }
        : undefined,
      status: query.status,
      supervisorUserId:
        actor.role === UserRole.SUPERVISOR
          ? actor.userId
          : query.supervisorUserId || undefined,
      OR: search
        ? [
            {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ]
        : undefined,
    };

    const [total, items] = await Promise.all([
      this.prismaService.team.count({ where }),
      this.prismaService.team.findMany({
        where,
        include: {
          supervisorUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              members: true,
            },
          },
        },
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((team) => ({
        id: team.id,
        name: team.name,
        code: team.code,
        description: team.description,
        region: team.region,
        supervisorUserId: team.supervisorUser?.id ?? null,
        supervisorName: team.supervisorUser?.name ?? null,
        status: team.status,
        active: team.active,
        promotersCount: team._count.members,
        createdAt: team.createdAt.toISOString(),
        updatedAt: team.updatedAt.toISOString(),
      })),
    };
  }

  async getTeamDetails(actorUserId: string, teamId: string) {
    const actor = await this.getActorContext(actorUserId);
    const team = await this.findTeamOrThrow(actor, teamId);
    return this.mapTeamDetail(team);
  }

  async listTeamMembers(actorUserId: string, teamId: string) {
    const actor = await this.getActorContext(actorUserId);
    const team = await this.findTeamOrThrow(actor, teamId);

    return {
      teamId: team.id,
      total: team.members.length,
      items: team.members.map((member) => this.mapTeamMember(member)),
    };
  }

  async createTeam(actorUserId: string, dto: CreateTeamDto) {
    const actor = await this.getActorContext(actorUserId);
    const payload = this.normalizePayload(dto);
    const supervisor = await this.resolveSupervisorReference(
      actor,
      payload.supervisorUserId,
    );

    await this.assertUniqueCode(actor.companyId, payload.code);

    const promoterIds = payload.promoterIds ?? [];
    await this.assertPromotersEligible(
      actor,
      promoterIds,
      supervisor?.id ?? null,
      null,
    );

    const team = await this.prismaService.$transaction(async (transaction) => {
      const createdTeam = await transaction.team.create({
        data: {
          companyId: actor.companyId,
          name: payload.name,
          code: payload.code,
          description: payload.description,
          region: payload.region ?? supervisor?.region ?? null,
          supervisorUserId: supervisor?.id ?? null,
          status: payload.status,
          active: payload.status === TeamStatus.ACTIVE,
        },
      });

      if (promoterIds.length > 0) {
        await transaction.teamMember.createMany({
          data: promoterIds.map((promoterId) => ({
            teamId: createdTeam.id,
            promoterId,
          })),
        });
      }

      return createdTeam;
    });

    await this.auditService.record(
      actor.userId,
      AuditEntityType.TEAM,
      team.id,
      'team.create',
      {
        code: payload.code,
        supervisorUserId: supervisor?.id ?? null,
        promotersCount: promoterIds.length,
        status: payload.status,
      },
    );

    this.logger.log(
      `Equipe criada actorUserId=${actor.userId} teamId=${team.id} members=${promoterIds.length}`,
    );

    return this.getTeamDetails(actor.userId, team.id);
  }

  async updateTeam(actorUserId: string, teamId: string, dto: UpdateTeamDto) {
    const actor = await this.getActorContext(actorUserId);
    const existing = await this.findTeamOrThrow(actor, teamId);
    const payload = this.normalizePayload(dto);
    const supervisor = await this.resolveSupervisorReference(
      actor,
      payload.supervisorUserId,
    );

    await this.assertUniqueCode(actor.companyId, payload.code, teamId);

    const promoterIds =
      payload.promoterIds ??
      existing.members.map((member) => member.promoterId);
    await this.assertPromotersEligible(
      actor,
      promoterIds,
      supervisor?.id ?? null,
      teamId,
    );

    const existingMemberIds = new Set(
      existing.members.map((member) => member.promoterId),
    );
    const nextMemberIds = new Set(promoterIds);
    const promoterIdsToRemove = existing.members
      .filter((member) => !nextMemberIds.has(member.promoterId))
      .map((member) => member.promoterId);
    const promoterIdsToAdd = promoterIds.filter(
      (promoterId) => !existingMemberIds.has(promoterId),
    );

    await this.prismaService.$transaction(async (transaction) => {
      await transaction.team.update({
        where: {
          id: teamId,
        },
        data: {
          name: payload.name,
          code: payload.code,
          description: payload.description,
          region: payload.region ?? supervisor?.region ?? null,
          supervisorUserId: supervisor?.id ?? null,
          status: payload.status,
          active: payload.status === TeamStatus.ACTIVE,
        },
      });

      if (promoterIdsToRemove.length > 0) {
        await transaction.teamMember.deleteMany({
          where: {
            teamId,
            promoterId: {
              in: promoterIdsToRemove,
            },
          },
        });
      }

      if (promoterIdsToAdd.length > 0) {
        await transaction.teamMember.createMany({
          data: promoterIdsToAdd.map((promoterId) => ({
            teamId,
            promoterId,
          })),
        });
      }
    });

    await this.auditService.record(
      actor.userId,
      AuditEntityType.TEAM,
      teamId,
      'team.update',
      {
        previousSupervisorUserId: existing.supervisorUserId,
        nextSupervisorUserId: supervisor?.id ?? null,
        previousStatus: existing.status,
        nextStatus: payload.status,
        promotersCount: promoterIds.length,
      },
    );

    this.logger.log(
      `Equipe atualizada actorUserId=${actor.userId} teamId=${teamId}`,
    );

    return this.getTeamDetails(actor.userId, teamId);
  }

  async updateTeamStatus(
    actorUserId: string,
    teamId: string,
    status: TeamStatus,
  ) {
    const actor = await this.getActorContext(actorUserId);
    const existing = await this.findTeamOrThrow(actor, teamId);
    const updated = await this.prismaService.team.update({
      where: {
        id: teamId,
      },
      data: {
        status,
        active: status === TeamStatus.ACTIVE,
      },
    });

    await this.auditService.record(
      actor.userId,
      AuditEntityType.TEAM,
      teamId,
      'team.status',
      {
        previousStatus: existing.status,
        nextStatus: status,
      },
    );

    return {
      id: updated.id,
      status: updated.status,
      active: updated.active,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async addTeamMembers(
    actorUserId: string,
    teamId: string,
    dto: UpdateTeamMembersDto,
  ) {
    const actor = await this.getActorContext(actorUserId);
    const team = await this.findTeamOrThrow(actor, teamId);
    const promoterIds = [...new Set(dto.promoterIds)];

    await this.assertPromotersEligible(
      actor,
      promoterIds,
      team.supervisorUserId ?? null,
      teamId,
    );

    const existingMemberIds = new Set(
      team.members.map((member) => member.promoterId),
    );
    const promoterIdsToAdd = promoterIds.filter(
      (promoterId) => !existingMemberIds.has(promoterId),
    );

    if (promoterIdsToAdd.length === 0) {
      return this.listTeamMembers(actor.userId, teamId);
    }

    await this.prismaService.teamMember.createMany({
      data: promoterIdsToAdd.map((promoterId) => ({
        teamId,
        promoterId,
      })),
    });

    await this.auditService.record(
      actor.userId,
      AuditEntityType.TEAM_MEMBER,
      teamId,
      'team.members.add',
      {
        promoterIds: promoterIdsToAdd,
      },
    );

    return this.listTeamMembers(actor.userId, teamId);
  }

  async removeTeamMember(
    actorUserId: string,
    teamId: string,
    memberId: string,
  ) {
    const actor = await this.getActorContext(actorUserId);
    await this.findTeamOrThrow(actor, teamId);

    const member = await this.prismaService.teamMember.findFirst({
      where: {
        id: memberId,
        teamId,
      },
      select: {
        id: true,
        promoterId: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Vinculo da equipe nao encontrado');
    }

    await this.prismaService.teamMember.delete({
      where: {
        id: memberId,
      },
    });

    await this.auditService.record(
      actor.userId,
      AuditEntityType.TEAM_MEMBER,
      teamId,
      'team.members.remove',
      {
        memberId,
        promoterId: member.promoterId,
      },
    );

    return {
      teamId,
      memberId,
      promoterId: member.promoterId,
      removed: true,
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
        name: true,
        region: true,
      },
    });

    if (!actor) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    return {
      userId: actor.id,
      companyId: actor.companyId,
      role: actor.role,
      name: actor.name,
      region: actor.region ?? null,
    };
  }

  private async findTeamOrThrow(
    actor: ActorContext,
    teamId: string,
  ): Promise<TeamEntity> {
    const team = await this.prismaService.team.findFirst({
      where: {
        id: teamId,
        companyId: actor.companyId,
        supervisorUserId:
          actor.role === UserRole.SUPERVISOR ? actor.userId : undefined,
      },
      include: {
        supervisorUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          include: {
            promoter: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    region: true,
                    employmentStatus: true,
                    active: true,
                  },
                },
                supervisorUser: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            promoter: {
              user: {
                name: 'asc',
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Equipe nao encontrada para este contexto');
    }

    return team;
  }

  private mapTeamDetail(team: TeamEntity) {
    return {
      id: team.id,
      name: team.name,
      code: team.code,
      description: team.description,
      region: team.region,
      supervisorUserId: team.supervisorUser?.id ?? null,
      supervisorName: team.supervisorUser?.name ?? null,
      supervisorEmail: team.supervisorUser?.email ?? null,
      status: team.status,
      active: team.active,
      promotersCount: team._count.members,
      members: team.members.map((member) => this.mapTeamMember(member)),
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
    };
  }

  private mapTeamMember(member: TeamEntity['members'][number]) {
    return {
      id: member.id,
      promoterId: member.promoterId,
      promoterUserId: member.promoter.user.id,
      promoterName: member.promoter.user.name,
      promoterEmail: member.promoter.user.email,
      employeeCode: member.promoter.employeeCode,
      region: member.promoter.user.region ?? null,
      status: member.promoter.user.employmentStatus,
      active: member.promoter.user.active && member.promoter.active,
      supervisorUserId: member.promoter.supervisorUser?.id ?? null,
      supervisorName: member.promoter.supervisorUser?.name ?? null,
      createdAt: member.createdAt.toISOString(),
    };
  }

  private normalizePayload(dto: CreateTeamDto | UpdateTeamDto) {
    return {
      name: dto.name.trim(),
      code: dto.code.trim().toUpperCase(),
      description: dto.description?.trim() || null,
      region: dto.region?.trim() || null,
      supervisorUserId: dto.supervisorUserId?.trim() || null,
      status: dto.status,
      promoterIds: dto.promoterIds ? [...new Set(dto.promoterIds)] : undefined,
    };
  }

  private async resolveSupervisorReference(
    actor: ActorContext,
    supervisorUserId: string | null,
  ): Promise<SupervisorReference | null> {
    if (actor.role === UserRole.SUPERVISOR) {
      if (supervisorUserId && supervisorUserId !== actor.userId) {
        throw new ForbiddenException(
          'Supervisor so pode criar ou editar equipes sob a propria responsabilidade.',
        );
      }

      return {
        id: actor.userId,
        name: actor.name,
        region: actor.region,
      };
    }

    if (!supervisorUserId) {
      return null;
    }

    const supervisor = await this.prismaService.user.findFirst({
      where: {
        id: supervisorUserId,
        companyId: actor.companyId,
        role: UserRole.SUPERVISOR,
        deletedAt: null,
        active: true,
      },
      select: {
        id: true,
        name: true,
        region: true,
      },
    });

    if (!supervisor) {
      throw new BadRequestException(
        'Supervisor responsavel nao encontrado ou inativo.',
      );
    }

    return {
      id: supervisor.id,
      name: supervisor.name,
      region: supervisor.region ?? null,
    };
  }

  private async assertUniqueCode(
    companyId: string,
    code: string,
    ignoreTeamId?: string,
  ) {
    const existing = await this.prismaService.team.findFirst({
      where: {
        companyId,
        code,
        id: ignoreTeamId
          ? {
              not: ignoreTeamId,
            }
          : undefined,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new ConflictException('Ja existe uma equipe com esse codigo.');
    }
  }

  private async assertPromotersEligible(
    actor: ActorContext,
    promoterIds: string[],
    supervisorUserId: string | null,
    ignoreTeamId: string | null,
  ) {
    if (promoterIds.length === 0) {
      return [];
    }

    const promoters = await this.prismaService.promoter.findMany({
      where: {
        id: {
          in: promoterIds,
        },
        companyId: actor.companyId,
        deletedAt: null,
        active: true,
        supervisorId:
          actor.role === UserRole.SUPERVISOR ? actor.userId : undefined,
        user: {
          deletedAt: null,
          active: true,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (promoters.length !== promoterIds.length) {
      throw new BadRequestException(
        'Um ou mais promotores nao foram encontrados, estao inativos ou nao pertencem ao contexto permitido.',
      );
    }

    if (supervisorUserId) {
      const promoterOutsideSupervisor = promoters.find(
        (promoter) => promoter.supervisorId !== supervisorUserId,
      );

      if (promoterOutsideSupervisor) {
        throw new BadRequestException(
          `O promotor ${promoterOutsideSupervisor.user.name} nao esta vinculado ao supervisor responsavel da equipe.`,
        );
      }
    }

    const existingMembers = await this.prismaService.teamMember.findMany({
      where: {
        promoterId: {
          in: promoterIds,
        },
        teamId: ignoreTeamId
          ? {
              not: ignoreTeamId,
            }
          : undefined,
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (existingMembers.length > 0) {
      const conflict = existingMembers[0];
      const promoter = promoters.find(
        (item) => item.id === conflict.promoterId,
      );
      throw new ConflictException(
        `O promotor ${promoter?.user.name ?? conflict.promoterId} ja pertence a equipe ${conflict.team.name} (${conflict.team.code}).`,
      );
    }

    return promoters.map<PromoterReference>((promoter) => ({
      id: promoter.id,
      name: promoter.user.name,
      supervisorId: promoter.supervisorId ?? null,
    }));
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { TeamStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListPromotersQueryDto } from './promoters.dto';

@Injectable()
export class PromotersService {
  constructor(private readonly prismaService: PrismaService) {}

  listActivePromoters() {
    return this.prismaService.promoter.findMany({
      where: {
        active: true,
        deletedAt: null,
        user: {
          active: true,
          deletedAt: null,
        },
      },
      include: {
        user: true,
      },
      orderBy: {
        user: {
          name: 'asc',
        },
      },
    });
  }

  findPromoterById(promoterId: string) {
    return this.prismaService.promoter.findFirst({
      where: {
        id: promoterId,
        deletedAt: null,
        user: {
          active: true,
          deletedAt: null,
        },
      },
      include: {
        user: true,
      },
    });
  }

  async listPromoters(actorUserId: string, query: ListPromotersQueryDto) {
    const actor = await this.prismaService.user.findUnique({
      where: {
        id: actorUserId,
      },
      select: {
        companyId: true,
        role: true,
      },
    });

    if (!actor) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    const eligibleForRoutePlanning = query.eligibleForRoutePlanning ?? false;
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where = {
      companyId: actor.companyId,
      deletedAt: null,
      active: query.active,
      id: undefined as string | undefined,
      supervisorId:
        actor.role === UserRole.ADMIN
          ? query.supervisorId
          : actor.role === UserRole.SUPERVISOR
            ? actorUserId
            : undefined,
      user: {
        active: true,
        deletedAt: null,
        OR: query.search
          ? [
              {
                name: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ]
          : undefined,
      },
      OR: eligibleForRoutePlanning
        ? [
            {
              teamMembership: {
                is: null,
              },
            },
            {
              teamMembership: {
                is: {
                  team: {
                    active: true,
                    status: TeamStatus.ACTIVE,
                  },
                },
              },
            },
          ]
        : undefined,
    };

    const [total, items] = await Promise.all([
      this.prismaService.promoter.count({ where }),
      this.prismaService.promoter.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              active: true,
            },
          },
          supervisorUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          journeys: {
            where: {
              OR: [
                {
                  active: true,
                },
                {
                  startedAt: {
                    gte: this.startOfDay(new Date()),
                  },
                },
              ],
            },
            orderBy: {
              startedAt: 'desc',
            },
            take: 1,
          },
          routePlans: {
            where: {
              routeDate: {
                gte: this.startOfDay(new Date()),
                lt: this.endOfDay(new Date()),
              },
              active: true,
            },
            select: {
              id: true,
            },
            take: 1,
          },
        },
        orderBy: {
          user: {
            name: 'asc',
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((item) => ({
        id: item.id,
        name: item.user.name,
        email: item.user.email,
        employeeCode: item.employeeCode,
        active: item.active,
        supervisorId: item.supervisorUser?.id ?? null,
        supervisorName: item.supervisorUser?.name ?? null,
        hasActiveJourney: item.journeys.some((journey) => journey.active),
        hasRoutePlanToday: item.routePlans.length > 0,
        latestJourneyStartedAt:
          item.journeys[0]?.startedAt.toISOString() ?? null,
      })),
    };
  }

  private startOfDay(referenceDate: Date) {
    const start = new Date(referenceDate);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private endOfDay(referenceDate: Date) {
    const end = this.startOfDay(referenceDate);
    end.setDate(end.getDate() + 1);
    return end;
  }
}

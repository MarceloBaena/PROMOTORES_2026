import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VisitsService {
  constructor(private readonly prismaService: PrismaService) {}

  findVisitById(visitId: string) {
    return this.prismaService.visit.findUnique({
      where: {
        id: visitId,
      },
      include: {
        client: true,
        promoter: {
          include: {
            user: true,
          },
        },
        routeStop: true,
        journey: true,
      },
    });
  }

  listPromoterVisits(promoterId: string) {
    return this.prismaService.visit.findMany({
      where: {
        promoterId,
      },
      include: {
        client: true,
        promoter: {
          include: {
            user: true,
          },
        },
        routeStop: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}

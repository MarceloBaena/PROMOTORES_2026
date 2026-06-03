import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GpsService {
  constructor(private readonly prismaService: PrismaService) {}

  findActiveJourney(promoterId: string) {
    return this.prismaService.journey.findFirst({
      where: {
        promoterId,
        active: true,
      },
      include: {
        promoter: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
    });
  }

  listJourneyTrackPoints(journeyId: string) {
    return this.prismaService.gpsLog.findMany({
      where: {
        journeyId,
      },
      orderBy: {
        capturedAt: 'asc',
      },
    });
  }
}

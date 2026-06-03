import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChecklistsService {
  constructor(private readonly prismaService: PrismaService) {}

  listActiveTemplates() {
    return this.prismaService.checklistTemplate.findMany({
      where: {
        active: true,
        deletedAt: null,
      },
      include: {
        questions: {
          where: {
            active: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });
  }

  listVisitResponses(visitId: string) {
    return this.prismaService.visitChecklistAnswer.findMany({
      where: {
        visitId,
      },
      include: {
        template: true,
      },
      orderBy: {
        template: {
          sortOrder: 'asc',
        },
      },
    });
  }
}

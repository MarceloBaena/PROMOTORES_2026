import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PhotosService {
  constructor(private readonly prismaService: PrismaService) {}

  listVisitPhotos(visitId: string) {
    return this.prismaService.visitPhoto.findMany({
      where: {
        visitId,
      },
      orderBy: {
        capturedAt: 'asc',
      },
    });
  }

  countVisitPhotos(visitId: string) {
    return this.prismaService.visitPhoto.count({
      where: {
        visitId,
      },
    });
  }
}

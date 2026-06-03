import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  findById(userId: string) {
    return this.prismaService.user.findUnique({
      where: {
        id: userId,
      },
    });
  }

  findByEmail(email: string) {
    return this.prismaService.user.findUnique({
      where: {
        email,
      },
    });
  }

  listActiveUsers() {
    return this.prismaService.user.findMany({
      where: {
        active: true,
        deletedAt: null,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }
}

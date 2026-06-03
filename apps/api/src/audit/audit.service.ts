import { Injectable, Logger } from '@nestjs/common';
import { AuditEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async record(
    actorUserId: string | null,
    entityType: AuditEntityType,
    entityId: string,
    action: string,
    payload: Prisma.InputJsonValue,
  ) {
    try {
      await this.prismaService.auditLog.create({
        data: {
          actorUserId: actorUserId ?? undefined,
          entityType,
          entityId,
          action,
          payload,
        },
      });
    } catch (error) {
      this.logger.error(
        `Unable to persist audit event ${entityType}:${entityId}:${action}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}

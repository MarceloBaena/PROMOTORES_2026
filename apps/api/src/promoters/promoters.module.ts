import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PromotersController } from './promoters.controller';
import { PromotersService } from './promoters.service';

@Module({
  imports: [PrismaModule],
  controllers: [PromotersController],
  providers: [PromotersService],
  exports: [PromotersService],
})
export class PromotersModule {}

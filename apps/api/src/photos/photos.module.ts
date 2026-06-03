import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PhotosService } from './photos.service';

@Module({
  imports: [PrismaModule],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}

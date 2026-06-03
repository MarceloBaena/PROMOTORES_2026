import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as express from 'express';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { createValidationException } from './common/validation-exception.factory';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const uploadsPath = join(process.cwd(), 'uploads');

  await mkdir(uploadsPath, { recursive: true });

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
      exceptionFactory: createValidationException,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.use('/uploads', express.static(uploadsPath));

  await app.listen(process.env.PORT ?? 3333);
}
void bootstrap();

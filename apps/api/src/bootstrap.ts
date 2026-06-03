import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as express from 'express';
import type { Express } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { createValidationException } from './common/validation-exception.factory';

const parseCorsOrigins = () => {
  const rawOrigins = process.env.CORS_ORIGIN?.split(',') ?? [];
  const origins = rawOrigins
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return origins.length > 0 ? origins : true;
};

export async function createApiApp() {
  const app = await NestFactory.create(AppModule);
  const uploadsPath = join(process.cwd(), 'uploads');

  await mkdir(uploadsPath, { recursive: true });

  app.setGlobalPrefix('api');
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
  app.enableCors({
    origin: parseCorsOrigins(),
    credentials: true,
  });
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

  return app;
}

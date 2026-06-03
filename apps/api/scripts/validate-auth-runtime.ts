import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

interface SessionResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'SUPERVISOR' | 'PROMOTER';
  };
  accessToken: string;
  refreshToken: string;
}

async function main() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  try {
    const server = app.getHttpServer();
    const supervisorLogin = await request(server).post('/api/auth/login').send({
      email: 'supervisor@formula.local',
      password: 'Supervisor@123',
    });
    const promoterLogin = await request(server).post('/api/auth/login').send({
      email: 'promotor.centro@formula.local',
      password: 'Promotor@123',
    });
    const adminLogin = await request(server).post('/api/auth/login').send({
      email: 'admin@formula.local',
      password: 'Admin@123',
    });

    if (
      supervisorLogin.status !== 201 ||
      promoterLogin.status !== 201 ||
      adminLogin.status !== 201
    ) {
      throw new Error('Falha ao autenticar usuarios seed de desenvolvimento');
    }

    const supervisorSession = supervisorLogin.body as SessionResponse;
    const promoterSession = promoterLogin.body as SessionResponse;
    const adminSession = adminLogin.body as SessionResponse;

    const meResponse = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${supervisorSession.accessToken}`);

    const dashboardAsSupervisor = await request(server)
      .get('/api/supervisor/dashboard')
      .set('Authorization', `Bearer ${supervisorSession.accessToken}`);

    const dashboardAsAdmin = await request(server)
      .get('/api/supervisor/dashboard')
      .set('Authorization', `Bearer ${adminSession.accessToken}`);

    const dashboardAsPromoter = await request(server)
      .get('/api/supervisor/dashboard')
      .set('Authorization', `Bearer ${promoterSession.accessToken}`);

    const operationsAsPromoter = await request(server)
      .get('/api/operations/route/today')
      .set('Authorization', `Bearer ${promoterSession.accessToken}`);

    const operationsAsSupervisor = await request(server)
      .get('/api/operations/route/today')
      .set('Authorization', `Bearer ${supervisorSession.accessToken}`);

    const refreshResponse = await request(server)
      .post('/api/auth/refresh')
      .send({
        refreshToken: supervisorSession.refreshToken,
      });

    if (refreshResponse.status !== 201) {
      throw new Error('Falha ao validar refresh token em runtime');
    }

    const refreshedSession = refreshResponse.body as SessionResponse;

    const logoutResponse = await request(server)
      .post('/api/auth/logout')
      .send({
        refreshToken: refreshedSession.refreshToken,
      });

    const revokedRefreshResponse = await request(server)
      .post('/api/auth/refresh')
      .send({
        refreshToken: refreshedSession.refreshToken,
      });

    console.log(
      JSON.stringify(
        {
          supervisorLogin: supervisorLogin.status,
          promoterLogin: promoterLogin.status,
          adminLogin: adminLogin.status,
          me: meResponse.status,
          supervisorDashboard: dashboardAsSupervisor.status,
          adminDashboard: dashboardAsAdmin.status,
          promoterDashboard: dashboardAsPromoter.status,
          promoterRoute: operationsAsPromoter.status,
          supervisorRoute: operationsAsSupervisor.status,
          refresh: refreshResponse.status,
          refreshRotated:
            refreshedSession.refreshToken !== supervisorSession.refreshToken,
          logout: logoutResponse.status,
          revokedRefresh: revokedRefreshResponse.status,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

void main();

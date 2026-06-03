import { createApiApp } from './bootstrap';

async function bootstrap() {
  const app = await createApiApp();

  await app.listen(process.env.PORT ?? 3333);
}
void bootstrap();

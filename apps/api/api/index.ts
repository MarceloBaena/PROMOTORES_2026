import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp } from '../src/bootstrap';

type RequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void;

let cachedHandler: RequestHandler | undefined;

const getHandler = async () => {
  if (cachedHandler) {
    return cachedHandler;
  }

  const app = await createApiApp();
  await app.init();
  cachedHandler = app.getHttpAdapter().getInstance() as RequestHandler;

  return cachedHandler;
};

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const requestHandler = await getHandler();
  requestHandler(request, response);
}

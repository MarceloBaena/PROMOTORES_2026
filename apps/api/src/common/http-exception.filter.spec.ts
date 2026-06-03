import { BadRequestException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  it('padroniza o payload de erro com requestId, metodo e detalhes', () => {
    const json = jest.fn();
    const setHeader = jest.fn();
    const response = {
      json,
      setHeader,
      status: jest.fn().mockReturnThis(),
    };
    const filter = new HttpExceptionFilter();
    const exception = new BadRequestException({
      error: 'ValidationError',
      message: 'email: Informe um email valido.',
      details: {
        validation: ['email: Informe um email valido.'],
        count: 1,
      },
    });
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/api/auth/login',
          url: '/api/auth/login',
          headers: {},
        }),
      }),
    } as ArgumentsHost;

    filter.catch(exception, host);

    expect(setHeader).toHaveBeenCalledWith('x-request-id', expect.any(String));
    expect(response.status).toHaveBeenCalledWith(400);

    const jsonCalls = json.mock.calls as Array<[Record<string, unknown>]>;
    const payload = jsonCalls[0]?.[0];

    expect(payload).toMatchObject({
      statusCode: 400,
      method: 'POST',
      path: '/api/auth/login',
      error: 'ValidationError',
      message: 'email: Informe um email valido.',
      details: {
        validation: ['email: Informe um email valido.'],
        count: 1,
      },
    });
    expect(typeof payload?.requestId).toBe('string');
  });
});

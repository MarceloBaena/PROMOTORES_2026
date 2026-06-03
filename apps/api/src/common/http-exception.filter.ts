import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const requestId =
      this.resolveHeader(request.headers['x-request-id']) ?? randomUUID();
    const error =
      typeof payload === 'string'
        ? payload
        : typeof payload === 'object' && payload !== null && 'error' in payload
          ? String(payload.error)
          : exception instanceof Error
            ? exception.name
            : 'InternalServerError';
    const message =
      typeof payload === 'string'
        ? payload
        : typeof payload === 'object' &&
            payload !== null &&
            'message' in payload
          ? this.normalizePrimaryMessage(payload.message)
          : exception instanceof Error
            ? exception.message
            : 'Unexpected error';
    const details =
      typeof payload === 'object' && payload !== null && 'details' in payload
        ? payload.details
        : this.normalizeDetails(payload);

    response.setHeader('x-request-id', requestId);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status} requestId=${requestId}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status >= 400) {
      this.logger.warn(
        `${request.method} ${request.originalUrl} -> ${status} requestId=${requestId} message=${message}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      path: request.originalUrl ?? request.url,
      method: request.method,
      requestId,
      error,
      message,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  private normalizePrimaryMessage(message: unknown) {
    if (Array.isArray(message)) {
      return message.map(String).join(' | ');
    }

    if (typeof message === 'string') {
      return message;
    }

    return 'Unexpected error';
  }

  private normalizeDetails(payload: unknown) {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      Array.isArray(payload.message)
    ) {
      return {
        validation: payload.message.map(String),
        count: payload.message.length,
      };
    }

    return undefined;
  }

  private resolveHeader(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
      return value[0]?.trim() || undefined;
    }

    return value?.trim() || undefined;
  }
}

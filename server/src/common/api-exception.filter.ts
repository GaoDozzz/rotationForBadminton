import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getOrCreateRequestId } from './api-response.interceptor';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = getOrCreateRequestId(request);

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    /*
     * Unknown exceptions must never expose stack traces, SQL messages, secrets, or local
     * paths to the mini program. They still need to be logged server-side with requestId;
     * otherwise every programming error is reduced to an untraceable generic HTTP 500.
     */
    if (!(exception instanceof HttpException)) {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(
        `${request.method} ${request.originalUrl} failed; requestId=${requestId}`,
        stack,
      );
    }

    const payload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message = extractMessage(payload, status);

    response.status(status).json({
      error: {
        code: mapErrorCode(status),
        message,
      },
      requestId,
    });
  }
}

function extractMessage(payload: string | object | undefined, status: number): string {
  if (typeof payload === 'string') return payload;
  if (payload && 'message' in payload) {
    const value = (payload as { message: unknown }).message;
    return Array.isArray(value) ? value.join('；') : String(value);
  }
  return status >= 500 ? '服务器暂时不可用，请稍后重试' : '请求处理失败';
}

function mapErrorCode(status: number): string {
  if (status === HttpStatus.BAD_REQUEST) return 'VALIDATION_FAILED';
  if (status === HttpStatus.UNAUTHORIZED) return 'AUTH_REQUIRED';
  if (status === HttpStatus.FORBIDDEN) return 'FORBIDDEN';
  if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
  if (status === HttpStatus.CONFLICT) return 'RESOURCE_CONFLICT';
  return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
}


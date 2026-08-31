import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface ApiEnvelope<T> {
  data: T;
  requestId: string;
}

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiEnvelope<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = getOrCreateRequestId(request);

    return next.handle().pipe(map((data) => ({ data, requestId })));
  }
}

/**
 * 接受网关传入的请求号便于跨服务追踪；没有网关时由应用生成。
 * 请求号只用于日志关联，不参与鉴权，也绝不能被当成幂等键使用。
 */
export function getOrCreateRequestId(request: Request): string {
  const incoming = request.header('x-request-id');
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  Object.assign(request, { requestId });
  return requestId;
}


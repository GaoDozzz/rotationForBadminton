import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class LocalDevelopmentGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const address = normalizeRemoteAddress(request.socket.remoteAddress ?? '');

    // 真机通过同一 WLAN 访问电脑时，来源不再是 127.0.0.1，而是 192.168/10/172.16～31
    // 私有地址。只在 development 环境放行这些地址，避免为了本地调试意外扩大正式环境权限。
    if (this.config.get<string>('nodeEnv') === 'development' && isLoopbackOrPrivateIpv4(address)) return true;
    throw new ForbiddenException('正式环境必须先完成微信登录认证');
  }
}

function normalizeRemoteAddress(address: string): string {
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
}

function isLoopbackOrPrivateIpv4(address: string): boolean {
  if (address === '::1' || address === '127.0.0.1') return true;
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return first === 10 || (first === 172 && second !== undefined && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

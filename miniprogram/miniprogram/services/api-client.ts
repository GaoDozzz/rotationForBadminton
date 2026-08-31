import type { AppCustomOptions } from '../app';
import { environment } from '../config/environment';
import type { ApiError, ApiSuccess } from '../shared/contracts';
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type RequestBody = string | WechatMiniprogram.IAnyObject | ArrayBuffer;
interface RequestOptions<TBody extends RequestBody> { path: string; method?: HttpMethod; body?: TBody; idempotencyKey?: string; }
/** 小程序统一请求入口；开发身份由后端回环地址守卫固定，客户端不能指定 openid。 */
export function request<TResponse, TBody extends RequestBody = WechatMiniprogram.IAnyObject>(options: RequestOptions<TBody>): Promise<TResponse> {
  const app = getApp<AppCustomOptions>(); const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (app.globalData.accessToken) headers.Authorization = `Bearer ${app.globalData.accessToken}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  return new Promise((resolve, reject) => wx.request<ApiSuccess<TResponse> | ApiError>({
    url: `${environment.apiBaseUrl}${options.path}`, method: options.method ?? 'GET', data: options.body, header: headers,
    success(result) { if (result.statusCode >= 200 && result.statusCode < 300 && 'data' in result.data) { resolve(result.data.data); return; } const error = 'error' in result.data ? result.data.error : { code: 'NETWORK_RESPONSE_INVALID', message: '服务器返回格式异常' }; reject(new ApiClientError(error.code, error.message)); },
    fail(error) {
      const message = error.errMsg.includes('errcode:-102') || error.errMsg.includes('cronet_error_code:-102')
        ? `手机无法连接开发服务器 ${environment.apiBaseUrl}。请确认手机与电脑在同一 Wi-Fi，并以管理员身份运行 scripts/configure-phone-debug-network.ps1。`
        : error.errMsg;
      reject(new ApiClientError('NETWORK_FAILED', message));
    },
  }));
}
export class ApiClientError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = 'ApiClientError'; } }



/**
 * 小程序运行时使用的轻量契约。
 *
 * 微信开发者工具的原生 TypeScript 编译器只处理 miniprogramRoot 内文件，
 * 不会像 Vite/Webpack 那样自动打包 Monorepo workspace 包。因此小程序不能
 * 直接从 `@zzjl/contracts` 导入运行时代码，否则编译后仍会留下无法加载的
 * npm 模块路径。这里保留小程序实际需要的最小枚举和响应类型。
 *
 * 服务端仍以 packages/contracts 为权威契约；后续建立 OpenAPI 生成流程时，
 * 本文件应改为自动生成，避免两端手工维护枚举。
 */
export enum MatchFormat {
  Singles = 'SINGLES',
  Doubles = 'DOUBLES',
  MixedDoubles = 'MIXED_DOUBLES',
}

export enum RegistrationMode {
  WechatSelfService = 'WECHAT_SELF_SERVICE',
  OrganizerManaged = 'ORGANIZER_MANAGED',
}

export enum Gender {
  Male = 'MALE',
  Female = 'FEMALE',
}

export interface ManualParticipantDraft {
  participantNumber: string;
  nickname: string;
  gender: Gender;
  level?: string;
}

export interface ApiSuccess<T> {
  data: T;
  requestId: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
}




export enum MatchFormat {
  Singles = 'SINGLES',
  Doubles = 'DOUBLES',
  MixedDoubles = 'MIXED_DOUBLES',
}
export * from './event-transfer';

export enum PlayMode {
  FreeRotation = 'FREE_ROTATION',
}

export enum RegistrationMode {
  WechatSelfService = 'WECHAT_SELF_SERVICE',
  OrganizerManaged = 'ORGANIZER_MANAGED',
}

export enum ParticipantSource {
  WechatSelfService = 'WECHAT_SELF_SERVICE',
  OrganizerEntry = 'ORGANIZER_ENTRY',
}

export enum FinishRule {
  FirstTo = 'FIRST_TO',
  DeuceWithCap = 'DEUCE_WITH_CAP',
}

export enum EventStatus {
  Draft = 'DRAFT',
  RegistrationOpen = 'REGISTRATION_OPEN',
  RegistrationClosed = 'REGISTRATION_CLOSED',
  ScheduleReady = 'SCHEDULE_READY',
  InProgress = 'IN_PROGRESS',
  Finished = 'FINISHED',
  Cancelled = 'CANCELLED',
}

export enum MatchStatus {
  Scheduled = 'SCHEDULED',
  InProgress = 'IN_PROGRESS',
  ScorePending = 'SCORE_PENDING',
  ScoreDisputed = 'SCORE_DISPUTED',
  Walkover = 'WALKOVER',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
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

export interface ScoreRule {
  scoreTo: 11 | 15 | 21 | 31;
  finishRule: FinishRule;
  scoreCap?: number;
}

export interface ApiSuccess<T> {
  data: T;
  requestId: string;
}

export interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> };
  requestId: string;
}

/** 比赛人数只由比赛形式推导，防止客户端和服务端使用不一致的队伍人数。 */
export function getMatchShape(format: MatchFormat): { teamSize: 1 | 2; playersPerMatch: 2 | 4 } {
  return format === MatchFormat.Singles
    ? { teamSize: 1, playersPerMatch: 2 }
    : { teamSize: 2, playersPerMatch: 4 };
}


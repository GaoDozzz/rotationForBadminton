import type { Gender, MatchFormat, RegistrationMode } from './contracts';

export type ScoreTarget = 11 | 15 | 21 | 31;
export interface LocalManualParticipant { localId: string; participantNumber: string; nickname: string; gender: Gender; level?: string; }
export interface EventDraftRecord {
  id: string; title: string; description?: string; matchFormat: MatchFormat; registrationMode: RegistrationMode;
  capacity?: number; courtCount: number; scoreTo: ScoreTarget; rounds: number;
  manualParticipants: LocalManualParticipant[]; createdAt: number; updatedAt: number;
}
export type EventDraftInput = Omit<EventDraftRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type EventStatus = 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'SCHEDULE_READY' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';
export interface ApiParticipant { id: string; participantNumber: string; nickname: string; gender: Gender; level?: string; status: 'REGISTERED' | 'WAITLISTED' | 'ACTIVE' | 'WITHDRAWN'; }
export interface ApiEventRecord {
  id: string; title: string; description?: string; shareCode: string; matchFormat: MatchFormat; registrationMode: RegistrationMode;
  status: EventStatus; capacity?: number; courtCount: number; scoreTo: ScoreTarget; rounds: number;
  participants?: ApiParticipant[]; _count?: { participants: number; matches: number }; createdAt: string; updatedAt: string;
}
export interface ApiMatchPlayer { side: 'A' | 'B'; position: number; participant: ApiParticipant; }
export interface ApiMatchRecord {
  id: string; roundNumber: number; courtNumber: number;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'SCORE_PENDING' | 'SCORE_DISPUTED' | 'WALKOVER' | 'COMPLETED' | 'CANCELLED';
  teamAScore: number | null; teamBScore: number | null; players: ApiMatchPlayer[];
}
export interface ApiRankingEntry {
  participantId: string; rank: number; points: number; wins: number; losses: number;
  scored: number; conceded: number; matchesPlayed: number; participant: ApiParticipant;
}
/** @deprecated 仅用于读取升级前留在设备上的本地球局。 */
export interface LocalEventRecord extends EventDraftRecord { eventId: string; status: EventStatus; publishedAt: number; }

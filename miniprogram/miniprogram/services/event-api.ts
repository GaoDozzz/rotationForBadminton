import type { ApiEventRecord, ApiMatchRecord, ApiRankingEntry, EventDraftRecord } from '../shared/models';
import { RegistrationMode } from '../shared/contracts';
import { request } from './api-client';
import { createOfflineEvent, deleteOfflineEvent, getOfflineEvent, listOfflineEvents, listOfflineMatches, listOfflineRankings, regenerateOfflineMatches, updateOfflinePlayers, updateOfflineScore } from './offline-session';
import { isOfflineMode } from './runtime-mode';
import { importOfflineEvent } from './offline-session';
import { formatEventTransfer, type EventTransfer } from '../shared/event-transfer';

export async function importEvent(data: EventTransfer): Promise<ApiEventRecord> {
  return isOfflineMode() ? importOfflineEvent(data) : request({ path: '/events/import', method: 'POST', body: { text: formatEventTransfer(data) } });
}

export function listEvents(): Promise<ApiEventRecord[]> { return isOfflineMode() ? Promise.resolve(listOfflineEvents()) : request({ path: '/events' }); }
export function createEvent(draft: Omit<EventDraftRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiEventRecord> {
  if (isOfflineMode()) return Promise.resolve(createOfflineEvent(draft));
  const organizerManaged = draft.registrationMode === RegistrationMode.OrganizerManaged;
  return request({
    path: '/events', method: 'POST', idempotencyKey: `event-${Date.now()}`,
    body: {
      title: draft.title, description: draft.description, matchFormat: draft.matchFormat, registrationMode: draft.registrationMode,
      capacity: organizerManaged ? undefined : draft.capacity, courtCount: draft.courtCount, scoreTo: draft.scoreTo, rounds: draft.rounds,
      participants: organizerManaged ? draft.manualParticipants.map(({ participantNumber, nickname, gender, level }) => ({ participantNumber, nickname, gender, level })) : [],
    },
  });
}
export function getEvent(eventId: string): Promise<ApiEventRecord> { return isOfflineMode() ? Promise.resolve(getOfflineEvent(eventId)) : request({ path: `/events/${eventId}` }); }
export function deleteEvent(eventId: string): Promise<{ deleted: boolean }> { return isOfflineMode() ? Promise.resolve(deleteOfflineEvent(eventId)) : request({ path: `/events/${eventId}`, method: 'DELETE' }); }
export function getSharedEvent(shareCode: string): Promise<ApiEventRecord> { return isOfflineMode() ? Promise.reject(new Error('离线模式无法使用微信自主报名')) : request({ path: `/events/share/${shareCode}` }); }
export function joinEvent(shareCode: string, body: { nickname: string; gender: string; level?: string }): Promise<unknown> { return isOfflineMode() ? Promise.reject(new Error('离线模式无法使用微信自主报名')) : request({ path: `/events/share/${shareCode}/join`, method: 'POST', body }); }
export function listMatches(eventId: string, filter: 'ALL' | 'PENDING' | 'LIVE' | 'FINISHED'): Promise<ApiMatchRecord[]> { return isOfflineMode() ? Promise.resolve(listOfflineMatches(eventId, filter)) : request({ path: `/events/${eventId}/matches?filter=${filter}` }); }
export function updateMatchScore(eventId: string, matchId: string, teamAScore: number, teamBScore: number): Promise<ApiMatchRecord> { return isOfflineMode() ? Promise.resolve(updateOfflineScore(eventId, matchId, teamAScore, teamBScore)) : request({ path: `/events/${eventId}/matches/${matchId}/score`, method: 'PUT', body: { teamAScore, teamBScore } }); }
export function updateMatchPlayers(eventId: string, matchId: string, teamAPlayerIds: string[], teamBPlayerIds: string[]): Promise<ApiMatchRecord> { return isOfflineMode() ? Promise.resolve(updateOfflinePlayers(eventId, matchId, teamAPlayerIds, teamBPlayerIds)) : request({ path: `/events/${eventId}/matches/${matchId}/players`, method: 'PUT', body: { teamAPlayerIds, teamBPlayerIds } }); }
export function listRankings(eventId: string): Promise<ApiRankingEntry[]> { return isOfflineMode() ? Promise.resolve(listOfflineRankings(eventId)) : request({ path: `/events/${eventId}/rankings` }); }
export function regenerateMatches(eventId: string): Promise<ApiEventRecord> { return isOfflineMode() ? Promise.resolve(regenerateOfflineMatches(eventId)) : request({ path: `/events/${eventId}/matches/regenerate`, method: 'POST' }); }

import type { ApiEventRecord, ApiMatchRecord, ApiRankingEntry, EventDraftRecord } from '../shared/models';
import { RegistrationMode } from '../shared/contracts';
import { request } from './api-client';

export function listEvents(): Promise<ApiEventRecord[]> { return request({ path: '/events' }); }
export function createEvent(draft: Omit<EventDraftRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiEventRecord> {
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
export function getEvent(eventId: string): Promise<ApiEventRecord> { return request({ path: `/events/${eventId}` }); }
export function deleteEvent(eventId: string): Promise<{ deleted: boolean }> { return request({ path: `/events/${eventId}`, method: 'DELETE' }); }
export function getSharedEvent(shareCode: string): Promise<ApiEventRecord> { return request({ path: `/events/share/${shareCode}` }); }
export function joinEvent(shareCode: string, body: { nickname: string; gender: string; level?: string }): Promise<unknown> { return request({ path: `/events/share/${shareCode}/join`, method: 'POST', body }); }
export function listMatches(eventId: string, filter: 'ALL' | 'PENDING' | 'LIVE' | 'FINISHED'): Promise<ApiMatchRecord[]> { return request({ path: `/events/${eventId}/matches?filter=${filter}` }); }
export function updateMatchScore(eventId: string, matchId: string, teamAScore: number, teamBScore: number): Promise<ApiMatchRecord> { return request({ path: `/events/${eventId}/matches/${matchId}/score`, method: 'PUT', body: { teamAScore, teamBScore } }); }
export function updateMatchPlayers(eventId: string, matchId: string, teamAPlayerIds: string[], teamBPlayerIds: string[]): Promise<ApiMatchRecord> { return request({ path: `/events/${eventId}/matches/${matchId}/players`, method: 'PUT', body: { teamAPlayerIds, teamBPlayerIds } }); }
export function listRankings(eventId: string): Promise<ApiRankingEntry[]> { return request({ path: `/events/${eventId}/rankings` }); }
export function regenerateMatches(eventId: string): Promise<ApiEventRecord> { return request({ path: `/events/${eventId}/matches/regenerate`, method: 'POST' }); }



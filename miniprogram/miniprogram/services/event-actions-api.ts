import { request } from './api-client';
import { confirmOfflineWithdraw, previewOfflineWithdraw, startOfflineEvent } from './offline-session';
import { isOfflineMode } from './runtime-mode';

export interface WithdrawPreview {
  participant: { id: string; nickname: string };
  affectedMatches: Array<{ id: string; roundNumber: number; courtNumber: number }>;
  message: string;
}

export function startEvent(eventId: string): Promise<unknown> {
  if (isOfflineMode()) return Promise.resolve(startOfflineEvent(eventId));
  return request({ path: `/events/${eventId}/start`, method: 'POST', body: {} });
}
export function previewWithdraw(eventId: string, participantId: string): Promise<WithdrawPreview> {
  if (isOfflineMode()) return Promise.resolve(previewOfflineWithdraw(eventId, participantId));
  return request({ path: `/events/${eventId}/withdraw/preview`, method: 'POST', body: { participantId } });
}
export function confirmWithdraw(eventId: string, participantId: string): Promise<unknown> {
  if (isOfflineMode()) return Promise.resolve(confirmOfflineWithdraw(eventId, participantId));
  return request({ path: `/events/${eventId}/withdraw/confirm`, method: 'POST', body: { participantId } });
}

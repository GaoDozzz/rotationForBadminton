import { request } from './api-client';

export interface WithdrawPreview {
  participant: { id: string; nickname: string };
  affectedMatches: Array<{ id: string; roundNumber: number; courtNumber: number }>;
  message: string;
}

export function startEvent(eventId: string): Promise<unknown> {
  return request({ path: `/events/${eventId}/start`, method: 'POST', body: {} });
}
export function previewWithdraw(eventId: string, participantId: string): Promise<WithdrawPreview> {
  return request({ path: `/events/${eventId}/withdraw/preview`, method: 'POST', body: { participantId } });
}
export function confirmWithdraw(eventId: string, participantId: string): Promise<unknown> {
  return request({ path: `/events/${eventId}/withdraw/confirm`, method: 'POST', body: { participantId } });
}

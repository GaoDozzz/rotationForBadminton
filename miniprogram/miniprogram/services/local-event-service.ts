import type { EventDraftRecord, LocalEventRecord } from '../shared/models';
import { RegistrationMode } from '../shared/contracts';
import { createLocalId } from './draft-service';

const STORAGE_KEY = 'zzjl:local-events:v1';
export function listLocalEvents(): LocalEventRecord[] {
  const events = wx.getStorageSync<LocalEventRecord[]>(STORAGE_KEY);
  return Array.isArray(events) ? events.slice().sort((a, b) => b.publishedAt - a.publishedAt) : [];
}
export function getLocalEvent(eventId: string): LocalEventRecord | undefined {
  return listLocalEvents().find((event) => event.eventId === eventId);
}
/** 兼容升级前本地数据；新球局统一写入 PostgreSQL。 */
export function publishLocalEvent(draft: EventDraftRecord): LocalEventRecord {
  const record: LocalEventRecord = {
    ...draft,
    eventId: createLocalId('legacy-event'),
    status: draft.registrationMode === RegistrationMode.OrganizerManaged ? 'IN_PROGRESS' : 'REGISTRATION_OPEN',
    publishedAt: Date.now(),
  };
  wx.setStorageSync(STORAGE_KEY, [record, ...listLocalEvents()]);
  return record;
}

import { canSaveDraft, MAX_DRAFTS_PER_USER } from '../shared/draft-policy';
import type { EventDraftInput, EventDraftRecord } from '../shared/models';
import { deleteOfflineDraft, getOfflineDraft, listOfflineDrafts, saveOfflineDraft } from './offline-session';
import { isOfflineMode } from './runtime-mode';

const STORAGE_KEY = 'zzjl:event-drafts:v1';
export class DraftLimitError extends Error { constructor() { super(`每个人最多保存 ${MAX_DRAFTS_PER_USER} 个草稿，请删除或编辑已有草稿`); this.name = 'DraftLimitError'; } }
export function listDrafts(): EventDraftRecord[] {
  if (isOfflineMode()) return listOfflineDrafts();
  return listPersistentDrafts();
}
/** 仅供进入离线模式时建立只读快照，不能用于离线写入。 */
export function listPersistentDrafts(): EventDraftRecord[] {
  const drafts = wx.getStorageSync<EventDraftRecord[]>(STORAGE_KEY); if (!Array.isArray(drafts)) return [];
  return drafts.map((draft) => ({ ...draft, rounds: draft.rounds ?? 10 })).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function getDraft(id: string): EventDraftRecord | undefined { return isOfflineMode() ? getOfflineDraft(id) : listPersistentDrafts().find((draft) => draft.id === id); }
/** 完整数组单次写入，避免索引和详情分两次保存后产生孤儿记录。 */
export function saveDraft(input: EventDraftInput, editingId?: string): EventDraftRecord {
  const drafts = listDrafts(); if (!canSaveDraft(drafts.map((item) => item.id), editingId)) throw new DraftLimitError();
  if (isOfflineMode()) return saveOfflineDraft(input, editingId);
  const now = Date.now(); const existing = editingId ? drafts.find((item) => item.id === editingId) : undefined;
  const record: EventDraftRecord = { ...input, id: existing?.id ?? createLocalId('draft'), createdAt: existing?.createdAt ?? now, updatedAt: now };
  wx.setStorageSync(STORAGE_KEY, existing ? drafts.map((item) => item.id === existing.id ? record : item) : [record, ...drafts]); return record;
}
export function deleteDraft(id: string): void {
  if (isOfflineMode()) { deleteOfflineDraft(id); return; }
  wx.setStorageSync(STORAGE_KEY, listPersistentDrafts().filter((draft) => draft.id !== id));
}
export function createLocalId(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }

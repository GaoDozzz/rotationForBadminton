import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { beginOfflineSession, importOfflineEvent, listOfflineEvents } from '../../services/offline-session';
import { enterOfflineMode, leaveOfflineMode } from '../../services/runtime-mode';
import { formatEventTransfer, type EventTransfer } from '../../shared/event-transfer';

const fixture: EventTransfer = {
  version: 1, title: '周五 | 自由转', description: '地点：球馆\n请准时',
  matchFormat: 'MIXED_DOUBLES', status: 'IN_PROGRESS', courtCount: 1, rounds: 2, scoreTo: 21, capacity: 4,
  participants: [
    { participantNumber: '1', nickname: '张 | 三', gender: 'MALE', status: 'ACTIVE' },
    { participantNumber: '2', nickname: '李"四', gender: 'FEMALE', status: 'ACTIVE' },
    { participantNumber: '3', nickname: '王五', gender: 'MALE', status: 'WITHDRAWN', level: 'L3' },
    { participantNumber: '4', nickname: '赵六', gender: 'FEMALE', status: 'ACTIVE' },
  ],
  matches: [
    { roundNumber: 1, courtNumber: 1, teamA: ['1', '2'], teamB: ['3', '4'], teamAScore: 21, teamBScore: 18, status: 'COMPLETED' },
    { roundNumber: 2, courtNumber: 1, teamA: ['1', '4'], teamB: ['3', '2'], teamAScore: 0, teamBScore: 0, status: 'SCHEDULED' },
  ],
}
type TestPage = { data: Record<string, any>; setData(value: Record<string, unknown>): void; [method: string]: any };
let definition: TestPage;
const modal = vi.fn(); const redirect = vi.fn();
beforeAll(async () => {
  vi.stubGlobal('Page', (value: TestPage) => { definition = value; });
  vi.stubGlobal('wx', { showToast: vi.fn(), showModal: modal, redirectTo: redirect });
  await import('./index');
});
beforeEach(() => { beginOfflineSession([]); enterOfflineMode(); modal.mockReset(); redirect.mockReset(); });
afterAll(() => { leaveOfflineMode(); vi.unstubAllGlobals(); });
function page(): TestPage {
  const result: TestPage = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(value: Record<string, unknown>) { Object.assign(this.data, value); } };
  result.data.offlineMode = true; result.data.text = formatEventTransfer(fixture); result.previewImport(); return result;
}
describe('import page name confirmation', () => {
  it('cancels same-name import without writing data', async () => {
    importOfflineEvent(fixture); const instance = page();
    modal.mockResolvedValueOnce({ confirm: false });
    await instance.confirmImport();
    expect(listOfflineEvents()).toHaveLength(1);
    expect(redirect).not.toHaveBeenCalled();
    expect(instance.data.submitting).toBe(false);
  });
  it('creates a renamed independent copy after confirmation', async () => {
    importOfflineEvent(fixture); const instance = page();
    modal.mockResolvedValueOnce({ confirm: true, content: '新球局' }).mockResolvedValueOnce({ confirm: true });
    await instance.confirmImport();
    expect(listOfflineEvents().map((event) => event.title)).toContain('新球局');
    expect(listOfflineEvents()).toHaveLength(2);
    expect(redirect).toHaveBeenCalledTimes(1);
  });
});

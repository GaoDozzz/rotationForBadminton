import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { Gender, MatchFormat, RegistrationMode } from '../../shared/contracts';
import { beginOfflineSession, createOfflineEvent, listOfflineMatches, listOfflineRankings, updateOfflineScore } from '../../services/offline-session';
import { enterOfflineMode, leaveOfflineMode } from '../../services/runtime-mode';

// 捕获原生 Page 定义，用同步 setData 模拟页面逻辑；不需要启动微信或写入真实数据。
type TestPage = { data: Record<string, any>; setData(value: Record<string, unknown>): void; [method: string]: any };
let definition: TestPage;
const touch = (dataset: Record<string, unknown>) => ({ currentTarget: { dataset } });

beforeAll(async () => {
  vi.stubGlobal('Page', (value: TestPage) => { definition = value; });
  vi.stubGlobal('wx', { showToast: vi.fn(), showModal: vi.fn().mockResolvedValue({ confirm: true }) });
  await import('./index');
});
afterAll(() => { leaveOfflineMode(); vi.unstubAllGlobals(); });

describe('detail reset and lineup regression', () => {
  beforeEach(() => { beginOfflineSession([]); enterOfflineMode(); });

  it.each([MatchFormat.Singles, MatchFormat.Doubles, MatchFormat.MixedDoubles])('resets, swaps occupied slots, saves and recomputes rankings: %s', async (format) => {
    const event = createOfflineEvent({
      title: '回归测试', matchFormat: format, registrationMode: RegistrationMode.OrganizerManaged,
      courtCount: 1, scoreTo: 21, rounds: 10,
      manualParticipants: Array.from({ length: 4 }, (_, index) => ({
        localId: String(index), participantNumber: String(index + 1), nickname: `选手${index}`,
        gender: index % 2 ? Gender.Female : Gender.Male,
      })),
    });
    const page: TestPage = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(value) { Object.assign(this.data, value); } };
    page.data.eventId = event.id;
    const match = listOfflineMatches(event.id, 'ALL')[0]!;
    updateOfflineScore(event.id, match.id, 21, 18);
    await page.loadEvent(event.id);
    expect(page.data.rankings.some((row: any) => row.points === 3)).toBe(true);
    page.openMatchEditor(touch({ id: match.id }));
    await page.resetScore();
    expect(page.data.rankings.every((row: any) => row.points === 0)).toBe(true);
    expect(page.data.participants.every((row: any) => row.points === 0)).toBe(true);
    page.openMatchEditor(touch({ id: match.id }));
    expect(page.data.canAdjustPlayers).toBe(true);
    const original = [...page.data.lineupIndices];
    const targetSlot = format === MatchFormat.Singles ? 1 : 2;
    page.openLineupSelector(touch({ slot: 0 }));
    page.selectLineupPlayer(touch({ index: original[targetSlot] }));
    expect(page.data.lineupIndices[0]).toBe(original[targetSlot]);
    expect(page.data.lineupIndices[targetSlot]).toBe(original[0]);
    expect(new Set(page.data.lineupIndices).size).toBe(original.length);
    await page.saveLineup();
    const saved = listOfflineMatches(event.id, 'ALL').find((row) => row.id === match.id)!;
    const winnerIds = saved.players.filter((player) => player.side === 'A').map((player) => player.participant.id);
    expect(winnerIds[0]).toBe(page.data.selectableParticipants[original[targetSlot]].id);
    page.openMatchEditor(touch({ id: match.id }));
    page.data.scorePickerValue = [21, 16];
    await page.saveScore();
    for (const id of winnerIds) expect(listOfflineRankings(event.id).find((row) => row.participantId === id)?.points).toBe(5);
    // 修改已结束比分应冲销上一次结果，再以新结果全量重算，不能累加旧积分。
    page.openMatchEditor(touch({ id: match.id }));
    page.data.scorePickerValue = [18, 21];
    await page.saveScore();
    for (const id of winnerIds) expect(listOfflineRankings(event.id).find((row) => row.participantId === id)?.points).toBe(-3);
    expect(page.data.participants.map((row: any) => row.points)).toEqual(page.data.participants.map((row: any) => page.data.rankings.find((rank: any) => rank.participantId === row.id).points));
  });

  it('saves a substitute after reset and removes the former player from the scoring lineup', async () => {
    const event = createOfflineEvent({
      title: '替补测试', matchFormat: MatchFormat.Doubles, registrationMode: RegistrationMode.OrganizerManaged,
      courtCount: 1, scoreTo: 21, rounds: 10,
      manualParticipants: Array.from({ length: 5 }, (_, index) => ({ localId: String(index), participantNumber: String(index + 1), nickname: `选手${index}`, gender: Gender.Male })),
    });
    const match = listOfflineMatches(event.id, 'ALL')[0]!;
    const formerId = match.players[0]!.participant.id;
    const substitute = event.participants!.find((row) => !match.players.some((player) => player.participant.id === row.id))!;
    const page: TestPage = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(value) { Object.assign(this.data, value); } };
    page.data.eventId = event.id;
    updateOfflineScore(event.id, match.id, 21, 18);
    await page.loadEvent(event.id);
    page.openMatchEditor(touch({ id: match.id }));
    await page.resetScore();
    page.openMatchEditor(touch({ id: match.id }));
    page.openLineupSelector(touch({ slot: 0 }));
    page.selectLineupPlayer(touch({ index: page.data.selectableParticipants.findIndex((row: any) => row.id === substitute.id) }));
    await page.saveLineup();
    expect(listOfflineMatches(event.id, 'ALL').find((row) => row.id === match.id)!.players.map((player) => player.participant.id)).toContain(substitute.id);
    page.openMatchEditor(touch({ id: match.id }));
    page.data.scorePickerValue = [21, 16];
    await page.saveScore();
    expect(listOfflineRankings(event.id).find((row) => row.participantId === formerId)?.points).toBe(0);
    expect(listOfflineRankings(event.id).find((row) => row.participantId === substitute.id)?.points).toBe(5);
  });
});

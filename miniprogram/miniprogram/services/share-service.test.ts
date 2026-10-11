import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAndSharePoster } from './share-service';
import { layoutPoster, type MatchPosterRow } from './match-share';
import { Gender } from '../shared/contracts';
import type { ApiRankingEntry } from '../shared/models';

afterEach(() => vi.unstubAllGlobals());

function mockCanvas() {
  const written: string[] = []; const exports: { height: number; destHeight: number }[] = [];
  const context = {
    setFillStyle: vi.fn(), fillRect: vi.fn(), setFontSize: vi.fn(), setTextAlign: vi.fn(),
    fillText: (text: string) => written.push(text), draw: (_reserve: boolean, done: () => void) => done(),
  };
  const wxMock = {
    createCanvasContext: vi.fn(() => context),
    canvasToTempFilePath: vi.fn((options: any) => { exports.push(options); options.success({ tempFilePath: `poster-${exports.length}.png` }); }),
    showShareImageMenu: vi.fn().mockResolvedValue({}), previewImage: vi.fn().mockResolvedValue({}),
    showModal: vi.fn().mockResolvedValue({ confirm: true }), showToast: vi.fn(),
  };
  vi.stubGlobal('wx', wxMock);
  const sizes: number[] = [];
  const page = { setData: (data: { posterCanvasHeight: number }, done: () => void) => { sizes.push(data.posterCanvasHeight); done(); } };
  return { page: page as unknown as WechatMiniprogram.Component.TrivialInstance, written, exports, sizes, wxMock };
}
const rows = (count: number): MatchPosterRow[] => Array.from({ length: count }, (_, index) => ({
  roundNumber: index + 1, courtNumber: 1, teamA: '1·测试甲 / 2·测试乙', teamB: '3·测试丙 / 4·测试丁', score: '17 : 21', status: '已结束', winner: 'B',
}));

describe('complete posters and direct WeChat sharing', () => {
  it('renders all 12 rounds on a dynamically sized long image and opens the direct share menu', async () => {
    const mock = mockCanvas();
    await buildAndSharePoster({ page: mock.page, canvasId: 'matchesPoster', title: '十一', subtitle: '双打 · 12轮', lines: [], matchRows: rows(12) });
    expect(mock.exports).toHaveLength(1);
    expect(mock.exports[0]!.height).toBeGreaterThan(880);
    expect(mock.exports[0]!.height).toBe(mock.sizes[0]);
    expect(mock.exports[0]!.destHeight).toBe(mock.sizes[0]! * 2);
    for (let round = 1; round <= 12; round++) expect(mock.written).toContain(`第 ${round} 轮`);
    expect(mock.wxMock.showShareImageMenu).toHaveBeenCalledWith({ path: 'poster-1.png', needShowEntrance: false });
    expect(mock.wxMock.previewImage).not.toHaveBeenCalled();
  });
  it('keeps every match when very large content needs multiple directly shareable images', async () => {
    const mock = mockCanvas(); const matches = rows(100);
    expect(layoutPoster([], matches, 130, 4096).flatMap((page) => page.blocks).filter((block) => block.kind === 'match')).toHaveLength(100);
    await buildAndSharePoster({ page: mock.page, canvasId: 'matchesPoster', title: '完整对阵', subtitle: '多场地', lines: [], matchRows: matches });
    expect(mock.exports.length).toBeGreaterThan(1);
    expect(mock.exports.every((page) => page.height <= 4096)).toBe(true);
    expect(mock.wxMock.showShareImageMenu).toHaveBeenCalledTimes(mock.exports.length);
    expect(mock.written).toContain('第 100 轮');
  });
  it('renders the ranking tab order, points, match counts, wins/losses and scored/conceded, not the roster', async () => {
    const mock = mockCanvas();
    const ranking = (id: string, rank: number, points: number): ApiRankingEntry => ({
      participantId: id, rank, points, matchesPlayed: 8, wins: 5, losses: 3, scored: 153, conceded: 141,
      participant: { id, participantNumber: id, nickname: `选手${id}`, gender: Gender.Male, status: 'ACTIVE' },
    });
    const rankings = [ranking('6', 1, 12), ranking('1', 2, -12)];
    await buildAndSharePoster({ page: mock.page, canvasId: 'rankingPoster', title: '积分排名', subtitle: '排名页签', lines: ['参赛名单不应被使用'], rankingRows: rankings });
    expect(mock.written.indexOf('选手6')).toBeLessThan(mock.written.indexOf('选手1'));
    expect(mock.written).toContain('+12 分'); expect(mock.written).toContain('-12 分');
    expect(mock.written).toContain('8 场 · 5 胜 3 负'); expect(mock.written).toContain('得 153 / 失 141');
    expect(mock.written).not.toContain('参赛名单不应被使用');
  });
});

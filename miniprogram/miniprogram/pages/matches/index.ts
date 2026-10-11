import { getEvent, listMatches, updateMatchScore } from '../../services/event-api';
import { buildAndSharePoster, copyShareText, isActionSheetCancel } from '../../services/share-service';
import type { ApiEventRecord, ApiMatchRecord } from '../../shared/models';

type MatchFilter = 'ALL' | 'PENDING' | 'LIVE' | 'FINISHED';
interface MatchView extends ApiMatchRecord {
  teamAName: string; teamBName: string; statusLabel: string; displayAScore: number; displayBScore: number; winner: '' | 'A' | 'B';
}
interface RoundGroup { roundNumber: number; matches: MatchView[]; completedCount: number; }
interface MatchesData {
  eventId: string; event?: ApiEventRecord; activeFilter: MatchFilter; matches: MatchView[]; roundGroups: RoundGroup[]; loading: boolean;
  editingMatchId: string; scoreColumns: number[][]; scorePickerValue: number[]; saving: boolean; posterCanvasHeight: number;
}
interface MatchesMethods {
  selectFilter(event: WechatMiniprogram.TouchEvent): void; loadMatches(): Promise<void>; editScore(event: WechatMiniprogram.TouchEvent): void;
  onScorePickerChange(event: WechatMiniprogram.CustomEvent<{ value: number[] }>): void; cancelScoreEdit(): void; saveScore(): Promise<void>; resetScore(): Promise<void>; shareMatches(): Promise<void>;
}

Page<MatchesData, MatchesMethods>({
  data: { eventId: '', activeFilter: 'ALL', matches: [], roundGroups: [], loading: false, editingMatchId: '', scoreColumns: [[], []], scorePickerValue: [0, 0], saving: false, posterCanvasHeight: 880 },
  onLoad(query) {
    if (!query.eventId) { void wx.showToast({ title: '缺少球局参数', icon: 'none' }); return; }
    this.setData({ eventId: query.eventId });
    void getEvent(query.eventId).then((event) => this.setData({ event })).then(() => this.loadMatches());
  },
  selectFilter(event) { this.setData({ activeFilter: event.currentTarget.dataset.filter as MatchFilter, editingMatchId: '' }); void this.loadMatches(); },
  async loadMatches() {
    if (!this.data.eventId) return;
    this.setData({ loading: true });
    try {
      const matches = (await listMatches(this.data.eventId, this.data.activeFilter)).map(toView);
      this.setData({ matches, roundGroups: groupByRound(matches) });
    } catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '对阵加载失败', icon: 'none' }); }
    finally { this.setData({ loading: false }); }
  },
  editScore(event) {
    const match = this.data.matches.find((item) => item.id === String(event.currentTarget.dataset.id));
    const currentEvent = this.data.event;
    if (!match || !currentEvent) return;
    const maximum = 31;
    const scores = Array.from({ length: maximum + 1 }, (_, index) => index);
    const untouched = match.displayAScore === 0 && match.displayBScore === 0;
    this.setData({ editingMatchId: match.id, scoreColumns: [scores, scores], scorePickerValue: untouched ? [currentEvent.scoreTo, 0] : [match.displayAScore, match.displayBScore] });
  },
  onScorePickerChange(event) { this.setData({ scorePickerValue: event.detail.value }); },
  cancelScoreEdit() { this.setData({ editingMatchId: '' }); },
  async saveScore() {
    if (!this.data.editingMatchId || this.data.saving) return;
    const [teamAScore = 0, teamBScore = 0] = this.data.scorePickerValue;
    this.setData({ saving: true });
    try {
      await updateMatchScore(this.data.eventId, this.data.editingMatchId, teamAScore, teamBScore);
      this.setData({ editingMatchId: '' }); await this.loadMatches();
      void wx.showToast({ title: '比分已更新', icon: 'success' });
    } catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '比分保存失败', icon: 'none' }); }
    finally { this.setData({ saving: false }); }
  },
  async resetScore() {
    if (!this.data.editingMatchId || this.data.saving) return;
    const result = await wx.showModal({ title: '重置比分', content: '将该场恢复为 0:0 和未开始状态，是否继续？' });
    if (!result.confirm) return;
    this.setData({ saving: true });
    try {
      await updateMatchScore(this.data.eventId, this.data.editingMatchId, 0, 0);
      this.setData({ editingMatchId: '' }); await this.loadMatches();
      void wx.showToast({ title: '比分已重置', icon: 'success' });
    } catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '重置失败', icon: 'none' }); }
    finally { this.setData({ saving: false }); }
  },
  async shareMatches() {
    const event = this.data.event; if (!event) return;
    const text = matchShareText(event, this.data.matches);
    try {
      const action = await wx.showActionSheet({ itemList: ['复制文字对阵', '生成并分享图片'] });
      if (action.tapIndex === 0) await copyShareText(text);
      else if (action.tapIndex === 1) await buildAndSharePoster({
        page: this as unknown as WechatMiniprogram.Component.TrivialInstance, canvasId: 'matchesPoster', title: event.title,
        subtitle: `${event.matchFormat === 'SINGLES' ? '单打' : event.matchFormat === 'MIXED_DOUBLES' ? '双打混双' : '双打'} · ${event.courtCount} 场地 · ${event.rounds} 轮 · ${event.scoreTo} 分制`,
        lines: matchPosterLines(this.data.matches), entrancePath: `/pages/event-detail/index?eventId=${event.id}`,
      });
    } catch (error) { if (!isActionSheetCancel(error)) void wx.showToast({ title: '分享内容生成失败', icon: 'none' }); }
  },
});

function toView(match: ApiMatchRecord): MatchView {
  const names = (side: 'A' | 'B') => match.players.filter((player) => player.side === side).sort((a, b) => a.position - b.position).map((player) => player.participant.nickname).join(' / ');
  const labels: Record<ApiMatchRecord['status'], string> = { SCHEDULED: '待完成', IN_PROGRESS: '比赛中', SCORE_PENDING: '待确认比分', SCORE_DISPUTED: '比分争议', WALKOVER: '已结束', COMPLETED: '已结束', CANCELLED: '已取消' };
  const displayAScore = match.teamAScore ?? 0; const displayBScore = match.teamBScore ?? 0;
  const winner = ['COMPLETED', 'WALKOVER'].includes(match.status) && displayAScore !== displayBScore ? (displayAScore > displayBScore ? 'A' : 'B') : '';
  return { ...match, teamAName: names('A'), teamBName: names('B'), statusLabel: labels[match.status], displayAScore, displayBScore, winner };
}
function groupByRound(matches: readonly MatchView[]): RoundGroup[] {
  const groups = new Map<number, MatchView[]>(); for (const match of matches) groups.set(match.roundNumber, [...(groups.get(match.roundNumber) ?? []), match]);
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([roundNumber, rows]) => ({ roundNumber, matches: rows, completedCount: rows.filter((row) => row.status === 'COMPLETED' || row.status === 'WALKOVER').length }));
}
function matchShareText(event: ApiEventRecord, matches: readonly MatchView[]): string { return [`【${event.title}】`, `${event.matchFormat === 'SINGLES' ? '单打' : event.matchFormat === 'MIXED_DOUBLES' ? '双打混双' : '双打'}｜${event.courtCount} 场地｜${event.rounds} 轮｜${event.scoreTo} 分制`, ...matchPosterLines(matches)].join('\n'); }
function matchPosterLines(matches: readonly MatchView[]): string[] { const result: string[] = []; let round = 0; for (const match of matches) { if (match.roundNumber !== round) { round = match.roundNumber; result.push(`—— 第 ${round} 轮 ——`); } result.push(`${match.courtNumber}号场  ${match.teamAName}  ${match.displayAScore}:${match.displayBScore}  ${match.teamBName}`); } return result; }


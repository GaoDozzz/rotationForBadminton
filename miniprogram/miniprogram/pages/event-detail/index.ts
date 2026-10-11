import { MatchFormat, RegistrationMode } from '../../shared/contracts';
import type { ApiEventRecord, ApiMatchRecord, ApiParticipant, ApiRankingEntry } from '../../shared/models';
import { startEvent } from '../../services/event-actions-api';
import { deleteEvent, getEvent, listMatches, listRankings, regenerateMatches, updateMatchPlayers, updateMatchScore } from '../../services/event-api';
import { buildAndSharePoster, copyShareText, isActionSheetCancel } from '../../services/share-service';
import { isOfflineMode } from '../../services/runtime-mode';
import { completeEventShare, matchPosterRows } from '../../services/match-share';

type DetailTab = 'INFO' | 'MATCHES' | 'RANKING';
type MatchFilter = 'ALL' | 'PENDING' | 'LIVE' | 'FINISHED';
interface ParticipantView extends ApiParticipant { points: number; rank?: number; matchesPlayed: number; filterSelected: boolean; }
interface MatchPreview extends ApiMatchRecord {
  teamAName: string; teamBName: string; displayAScore: number; displayBScore: number; statusLabel: string; statusTone: 'pending' | 'live' | 'finished' | 'warning' | 'neutral'; winner: '' | 'A' | 'B';
}
interface RoundPreview { roundNumber: number; matches: MatchPreview[]; completedCount: number; }
interface EventDetailData {
  eventId: string; event?: ApiEventRecord; activeTab: DetailTab; formatLabel: string; registrationLabel: string; statusLabel: string;
  participants: ParticipantView[]; selectableParticipants: ParticipantView[]; participantNames: string[]; rankings: ApiRankingEntry[]; allMatches: MatchPreview[]; roundGroups: RoundPreview[];
  loading: boolean; submitting: boolean; filterVisible: boolean; statusFilter: MatchFilter; selectedParticipantIds: string[]; filterCount: number; offlineMode: boolean; posterCanvasHeight: number;
  editorVisible: boolean; activeMatchId: string; activeMatch?: MatchPreview; scoreColumns: number[][]; scorePickerValue: number[];
  lineupSlots: number[]; lineupIndices: number[]; canAdjustPlayers: boolean; savingMatch: boolean; managingMatches: boolean; lineupSelectorVisible: boolean; activeLineupSlot: number;
}
interface EventDetailMethods {
  noop(): void;
  loadEvent(eventId: string): Promise<void>; selectTab(event: WechatMiniprogram.TouchEvent): void;
  openParticipantManage(): void; beginEvent(): Promise<void>; deleteCurrentEvent(): Promise<void>; shareRankings(): Promise<void>; shareMatches(): Promise<void>; openMatchManage(): Promise<void>; regenerateCurrentMatches(): Promise<void>;
  openFilter(): void; closeFilter(): void; clearFilter(): void; selectStatusFilter(event: WechatMiniprogram.TouchEvent): void;
  onParticipantFilterChange(event: WechatMiniprogram.CustomEvent<{ value: string[] }>): void; applyFilters(): void;
  openMatchEditor(event: WechatMiniprogram.TouchEvent): void; closeMatchEditor(): void;
  onScorePickerChange(event: WechatMiniprogram.CustomEvent<{ value: number[] }>): void; openLineupSelector(event: WechatMiniprogram.TouchEvent): void; closeLineupSelector(): void; selectLineupPlayer(event: WechatMiniprogram.TouchEvent): void;
  saveScore(): Promise<void>; resetScore(): Promise<void>; saveLineup(): Promise<void>;
}

Page<EventDetailData, EventDetailMethods>({
  data: {
    eventId: '', activeTab: 'INFO', formatLabel: '', registrationLabel: '', statusLabel: '', participants: [], selectableParticipants: [], participantNames: [],
    rankings: [], allMatches: [], roundGroups: [], loading: true, submitting: false, offlineMode: false, posterCanvasHeight: 880,
    filterVisible: false, statusFilter: 'ALL', selectedParticipantIds: [], filterCount: 0,
    editorVisible: false, activeMatchId: '', scoreColumns: [[], []], scorePickerValue: [0, 0], lineupSlots: [], lineupIndices: [], canAdjustPlayers: false, savingMatch: false, managingMatches: false, lineupSelectorVisible: false, activeLineupSlot: -1,
  },
  onLoad(query) {
    if (!query.eventId) { void wx.showToast({ title: '缺少球局参数', icon: 'none' }); return; }
    const offlineMode = isOfflineMode(); this.setData({ eventId: query.eventId, offlineMode });
    if (offlineMode) void wx.hideShareMenu(); else void wx.showShareMenu({ menus: ['shareAppMessage'] });
  },
  onShow() { if (this.data.eventId) void this.loadEvent(this.data.eventId); },
  noop() {},
  async loadEvent(eventId) {
    try {
      const [event, rankings, matches] = await Promise.all([getEvent(eventId), listRankings(eventId), listMatches(eventId, 'ALL')]);
      const rankingMap = new Map(rankings.map((row) => [row.participantId, row]));
      const participants = (event.participants ?? []).map((participant) => {
        const row = rankingMap.get(participant.id);
        return { ...participant, points: row?.points ?? 0, rank: row?.rank, matchesPlayed: row?.matchesPlayed ?? 0, filterSelected: this.data.selectedParticipantIds.includes(participant.id) };
      });
      const allMatches = matches.map(toMatchPreview);
      const selectableParticipants = participants.filter((item) => item.status !== 'WITHDRAWN');
      this.setData({
        event, rankings, participants, selectableParticipants, participantNames: selectableParticipants.map((item) => `${item.participantNumber} · ${item.nickname}`), allMatches,
        formatLabel: event.matchFormat === MatchFormat.Singles ? '单打' : event.matchFormat === MatchFormat.MixedDoubles ? '双打混双' : '双打',
        registrationLabel: event.registrationMode === RegistrationMode.OrganizerManaged ? '组织者录入' : '微信自主报名',
        statusLabel: eventStatusLabel(event.status), loading: false,
      });
      this.applyFilters();
    } catch (error) {
      this.setData({ loading: false });
      void wx.showToast({ title: error instanceof Error ? error.message : '球局加载失败', icon: 'none' });
    }
  },
  selectTab(event) { this.setData({ activeTab: event.currentTarget.dataset.tab as DetailTab }); },
  openParticipantManage() { if (this.data.event) void wx.navigateTo({ url: `/pages/participant-manage/index?eventId=${this.data.event.id}` }); },
  async beginEvent() {
    const event = this.data.event; if (!event || this.data.submitting) return;
    const result = await wx.showModal({ title: '生成对阵并开始', content: `将根据当前名单生成 ${event.rounds} 轮对阵，是否继续？` });
    if (!result.confirm) return;
    this.setData({ submitting: true });
    try { await startEvent(event.id); await this.loadEvent(event.id); }
    catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '开始失败', icon: 'none' }); }
    finally { this.setData({ submitting: false }); }
  },
  async deleteCurrentEvent() {
    const event = this.data.event; if (!event) return;
    const result = await wx.showModal({ title: '删除球局', content: '是否确认删除该球局？' });
    if (!result.confirm) return;
    try { await deleteEvent(event.id); void wx.reLaunch({ url: '/pages/home/index' }); }
    catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '删除失败', icon: 'none' }); }
  },
  openFilter() { this.setData({ filterVisible: true }); },
  closeFilter() { this.setData({ filterVisible: false }); },
  clearFilter() { this.setData({ statusFilter: 'ALL', selectedParticipantIds: [], filterCount: 0, participants: this.data.participants.map((item) => ({ ...item, filterSelected: false })) }); this.applyFilters(); },
  selectStatusFilter(event) { this.setData({ statusFilter: event.currentTarget.dataset.filter as MatchFilter }); },
  onParticipantFilterChange(event) { const selectedParticipantIds = event.detail.value; const selected = new Set(selectedParticipantIds); this.setData({ selectedParticipantIds, participants: this.data.participants.map((item) => ({ ...item, filterSelected: selected.has(item.id) })) }); },
  applyFilters() {
    const { allMatches, statusFilter, selectedParticipantIds } = this.data;
    const matches = allMatches.filter((match) => {
      const statusMatches = statusFilter === 'ALL'
        || (statusFilter === 'PENDING' && ['SCHEDULED', 'SCORE_PENDING', 'SCORE_DISPUTED'].includes(match.status))
        || (statusFilter === 'LIVE' && match.status === 'IN_PROGRESS')
        || (statusFilter === 'FINISHED' && ['COMPLETED', 'WALKOVER'].includes(match.status));
      if (!statusMatches) return false;
      const playerIds = new Set(match.players.map((player) => player.participant.id));
      return selectedParticipantIds.every((id) => playerIds.has(id));
    });
    this.setData({ roundGroups: groupMatches(matches), filterVisible: false, filterCount: selectedParticipantIds.length + (statusFilter === 'ALL' ? 0 : 1) });
  },
  openMatchEditor(event) {
    const match = this.data.allMatches.find((item) => item.id === String(event.currentTarget.dataset.id));
    const currentEvent = this.data.event;
    if (!match || !currentEvent) return;
    const maximum = 31;
    const scores = Array.from({ length: maximum + 1 }, (_, index) => index);
    const untouched = (match.teamAScore ?? 0) === 0 && (match.teamBScore ?? 0) === 0;
    const scorePickerValue = untouched ? [0, 0] : [match.displayAScore, match.displayBScore];
    const orderedPlayers = [...match.players].sort((a, b) => a.side.localeCompare(b.side) || a.position - b.position);
    const lineupIndices = orderedPlayers.map((player) => Math.max(0, this.data.selectableParticipants.findIndex((item) => item.id === player.participant.id)));
    this.setData({
      editorVisible: true, activeMatchId: match.id, activeMatch: match, scoreColumns: [scores, scores], scorePickerValue,
      lineupSlots: orderedPlayers.map((_, index) => index), lineupIndices, canAdjustPlayers: match.status === 'SCHEDULED' && untouched,
    });
  },
  closeMatchEditor() { if (!this.data.savingMatch && !this.data.lineupSelectorVisible) this.setData({ editorVisible: false, activeMatchId: '', activeMatch: undefined }); },
  onScorePickerChange(event) { this.setData({ scorePickerValue: event.detail.value }); },
  openLineupSelector(event) {
    if (!this.data.canAdjustPlayers) return;
    this.setData({ lineupSelectorVisible: true, activeLineupSlot: Number(event.currentTarget.dataset.slot) });
  },
  closeLineupSelector() { this.setData({ lineupSelectorVisible: false, activeLineupSlot: -1 }); },
  selectLineupPlayer(event) {
    const slot = this.data.activeLineupSlot; const participantIndex = Number(event.currentTarget.dataset.index);
    if (!this.data.canAdjustPlayers || this.data.savingMatch || slot < 0 || slot >= this.data.lineupIndices.length || !this.data.selectableParticipants[participantIndex]) return;
    const lineupIndices = [...this.data.lineupIndices];
    // 选择本场另一位置的人员时交换两个位置，保持每场参赛人员唯一。
    // 直接覆盖会产生重复人员，在线/离线保存都会被拒绝；交换也支持四人双打调整搭档。
    const occupiedSlot = lineupIndices.indexOf(participantIndex);
    if (occupiedSlot >= 0 && occupiedSlot !== slot) lineupIndices[occupiedSlot] = lineupIndices[slot]!;
    lineupIndices[slot] = participantIndex;
    this.setData({ lineupIndices, lineupSelectorVisible: false, activeLineupSlot: -1 });
  },
  async saveScore() {
    if (!this.data.activeMatchId || this.data.savingMatch) return;
    const [teamAScore = 0, teamBScore = 0] = this.data.scorePickerValue;
    this.setData({ savingMatch: true });
    try {
      await updateMatchScore(this.data.eventId, this.data.activeMatchId, teamAScore, teamBScore);
      this.setData({ editorVisible: false }); await this.loadEvent(this.data.eventId);
      void wx.showToast({ title: '比分已更新', icon: 'success' });
    } catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '比分保存失败', icon: 'none' }); }
    finally { this.setData({ savingMatch: false }); }
  },
  async resetScore() {
    if (!this.data.activeMatchId || this.data.savingMatch) return;
    const result = await wx.showModal({ title: '重置比分', content: '将比分恢复为 0:0，并把该场设为未开始，是否继续？' });
    if (!result.confirm) return;
    this.setData({ savingMatch: true });
    try {
      await updateMatchScore(this.data.eventId, this.data.activeMatchId, 0, 0);
      this.setData({ editorVisible: false }); await this.loadEvent(this.data.eventId);
      void wx.showToast({ title: '比分已重置', icon: 'success' });
    } catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '重置失败', icon: 'none' }); }
    finally { this.setData({ savingMatch: false }); }
  },
  async saveLineup() {
    const currentEvent = this.data.event;
    if (!currentEvent || !this.data.activeMatchId || !this.data.canAdjustPlayers || this.data.savingMatch) return;
    const teamSize = currentEvent.matchFormat === MatchFormat.Singles ? 1 : 2;
    const selected = this.data.lineupIndices.map((index) => this.data.selectableParticipants[index]?.id).filter((id): id is string => Boolean(id));
    if (selected.length !== teamSize * 2 || new Set(selected).size !== selected.length) { void wx.showToast({ title: '同一场不能重复选择参赛者', icon: 'none' }); return; }
    this.setData({ savingMatch: true });
    try {
      await updateMatchPlayers(this.data.eventId, this.data.activeMatchId, selected.slice(0, teamSize), selected.slice(teamSize));
      this.setData({ editorVisible: false }); await this.loadEvent(this.data.eventId);
      void wx.showToast({ title: '对阵人员已调整', icon: 'success' });
    } catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '人员调整失败', icon: 'none' }); }
    finally { this.setData({ savingMatch: false }); }
  },
  async openMatchManage() {
    const event = this.data.event;
    if (!event || event.status !== 'IN_PROGRESS' || this.data.managingMatches) return;
    try {
      const action = await wx.showActionSheet({ itemList: ['重新排列对阵'] });
      if (action.tapIndex === 0) await this.regenerateCurrentMatches();
    } catch (error) {
      if (!isActionSheetCancel(error)) void wx.showToast({ title: '管理操作打开失败', icon: 'none' });
    }
  },
  async regenerateCurrentMatches() {
    const event = this.data.event;
    if (!event || this.data.managingMatches) return;
    const result = await wx.showModal({
      title: '重新排列对阵',
      content: '将保留比赛中和已结束的场次，仅重新生成尚未开始的剩余对阵，总轮数不变。是否继续？',
      confirmText: '确认重排',
    });
    if (!result.confirm) return;
    this.setData({ managingMatches: true });
    try {
      await regenerateMatches(event.id);
      await this.loadEvent(event.id);
      void wx.showToast({ title: '对阵已重新排列', icon: 'success' });
    } catch (error) {
      void wx.showToast({ title: error instanceof Error ? error.message : '对阵重排失败', icon: 'none' });
    } finally {
      this.setData({ managingMatches: false });
    }
  },
  async shareMatches() {
    const event = this.data.event; if (!event) return;
    const visibleMatches = this.data.roundGroups.flatMap((group) => group.matches);
    const lines = matchPosterLines(visibleMatches);
    const text = [`【${event.title}】`, `${this.data.formatLabel}｜${event.courtCount} 场地｜${event.rounds} 轮｜${event.scoreTo} 分制`, ...lines].join('\n');
    try {
      const action = await wx.showActionSheet({ itemList: ['复制完整对阵（可导入）', '复制当前筛选对阵', '分享当前对阵图'] });
      if (action.tapIndex === 0) {
        const [latestEvent, allMatches] = await Promise.all([getEvent(event.id), listMatches(event.id, 'ALL')]);
        await copyShareText(completeEventShare(latestEvent, allMatches));
      } else if (action.tapIndex === 1) await copyShareText(text);
      else if (action.tapIndex === 2) await buildAndSharePoster({
        page: this as unknown as WechatMiniprogram.Component.TrivialInstance, canvasId: 'matchesPoster', title: event.title,
        subtitle: `${this.data.formatLabel} · ${event.courtCount} 场地 · ${event.rounds} 轮 · ${event.scoreTo} 分制`,
        lines, matchRows: matchPosterRows(visibleMatches), entrancePath: this.data.offlineMode ? undefined : `/pages/event-detail/index?eventId=${event.id}`,
      });
    } catch (error) { if (!isActionSheetCancel(error)) void wx.showToast({ title: error instanceof Error ? error.message : '对阵分享生成失败', icon: 'none' }); }
  },
  async shareRankings() {
    const event = this.data.event; if (!event) return;
    const lines = rankingLines(this.data.rankings); const text = [`【${event.title}｜积分排名】`, ...lines].join('\n');
    try {
      const action = await wx.showActionSheet({ itemList: ['复制文字排名', '分享排名图'] });
      if (action.tapIndex === 0) await copyShareText(text);
      else if (action.tapIndex === 1) await buildAndSharePoster({
        page: this as unknown as WechatMiniprogram.Component.TrivialInstance, canvasId: 'rankingPoster', title: `${event.title} · 积分排名`,
        subtitle: `${this.data.formatLabel} · 胜方加分 / 负方减分`, lines, rankingRows: this.data.rankings, entrancePath: this.data.offlineMode ? undefined : `/pages/event-detail/index?eventId=${event.id}`,
      });
    } catch (error) { if (!isActionSheetCancel(error)) void wx.showToast({ title: '排名分享生成失败', icon: 'none' }); }
  },
  onShareAppMessage() {
    if (this.data.offlineMode) { void wx.showToast({ title: '离线球局不支持链接分享', icon: 'none' }); return { title: '转转接龙', path: '/pages/home/index' }; }
    const event = this.data.event;
    return { title: event ? `${event.title}｜邀请你报名` : '转转接龙', path: event ? `/pages/registration/index?shareCode=${event.shareCode}` : '/pages/home/index' };
  },
});

function eventStatusLabel(status: ApiEventRecord['status']): string {
  if (status === 'IN_PROGRESS') return '进行中'; if (status === 'FINISHED') return '已结束'; if (status === 'CANCELLED') return '已取消'; return '报名中';
}
function toMatchPreview(match: ApiMatchRecord): MatchPreview {
  const names = (side: 'A' | 'B') => match.players.filter((player) => player.side === side).sort((a, b) => a.position - b.position).map((player) => player.participant.nickname).join(' / ');
  const labels: Record<ApiMatchRecord['status'], string> = { SCHEDULED: '未开始', IN_PROGRESS: '比赛中', SCORE_PENDING: '待确认', SCORE_DISPUTED: '有争议', WALKOVER: '已结束', COMPLETED: '已结束', CANCELLED: '已取消' };
  const tones: Record<ApiMatchRecord['status'], MatchPreview['statusTone']> = { SCHEDULED: 'pending', IN_PROGRESS: 'live', SCORE_PENDING: 'warning', SCORE_DISPUTED: 'warning', WALKOVER: 'finished', COMPLETED: 'finished', CANCELLED: 'neutral' };
  const displayAScore = match.teamAScore ?? 0; const displayBScore = match.teamBScore ?? 0;
  const winner = ['COMPLETED', 'WALKOVER'].includes(match.status) && displayAScore !== displayBScore ? (displayAScore > displayBScore ? 'A' : 'B') : '';
  return { ...match, teamAName: names('A'), teamBName: names('B'), displayAScore, displayBScore, statusLabel: labels[match.status], statusTone: tones[match.status], winner };
}
function groupMatches(matches: readonly MatchPreview[]): RoundPreview[] {
  const groups = new Map<number, MatchPreview[]>();
  for (const match of matches) groups.set(match.roundNumber, [...(groups.get(match.roundNumber) ?? []), match]);
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([roundNumber, rows]) => ({
    roundNumber, matches: rows, completedCount: rows.filter((row) => row.status === 'COMPLETED' || row.status === 'WALKOVER').length,
  }));
}
function rankingLines(rankings: readonly ApiRankingEntry[]): string[] { return rankings.map((row) => `${row.rank}. ${row.participant.nickname}  ${row.points > 0 ? '+' : ''}${row.points}分  ${row.wins}胜${row.losses}负`); }
function matchPosterLines(matches: readonly MatchPreview[]): string[] {
  const result: string[] = []; let round = 0;
  for (const match of matches) {
    if (match.roundNumber !== round) { round = match.roundNumber; result.push(`—— 第 ${round} 轮 ——`); }
    result.push(`${match.courtNumber}号场 · ${match.statusLabel}`);
    result.push(`A队：${match.teamAName}`);
    result.push(`比分：${match.displayAScore} : ${match.displayBScore}`);
    result.push(`B队：${match.teamBName}`);
    result.push('');
  }
  return result;
}



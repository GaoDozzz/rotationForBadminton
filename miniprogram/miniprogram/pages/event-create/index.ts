import { Gender, MatchFormat, RegistrationMode } from '../../shared/contracts';
import type { EventDraftInput, EventDraftRecord, LocalManualParticipant, ScoreTarget } from '../../shared/models';
import { DraftLimitError, deleteDraft, getDraft, listDrafts, saveDraft } from '../../services/draft-service';
import { createEvent } from '../../services/event-api';

const COURT_OPTIONS = Array.from({ length: 16 }, (_, index) => index + 1);
const SCORE_OPTIONS: ScoreTarget[] = [11, 15, 21, 31];
const ROUND_OPTIONS = Array.from({ length: 20 }, (_, index) => index + 1);
const LEVEL_OPTIONS = ['请选择水平（选填）', ...Array.from({ length: 15 }, (_, index) => `L${1 + index * 0.5}`)];

interface EventDraftData {
  draftId: string; title: string; description: string; matchFormat: MatchFormat; registrationMode: RegistrationMode;
  capacity?: number; capacityOptions: number[]; capacityIndex: number; courtCount: number; courtOptions: number[]; courtIndex: number;
  scoreTo: ScoreTarget; scoreOptions: ScoreTarget[]; scoreIndex: number;
  rounds: number; roundOptions: number[]; roundIndex: number; recommendedRounds: number;
  levelOptions: string[]; manualNumber: string; manualNickname: string; manualGender: Gender | ''; manualLevel: string; manualLevelIndex: number;
  manualParticipants: LocalManualParticipant[]; submitting: boolean; draftLimitReached: boolean;
}
interface EventCreateMethods {
  onTitleInput(event: WechatMiniprogram.Input): void; onDescriptionInput(event: WechatMiniprogram.TextareaInput): void;
  selectFormat(event: WechatMiniprogram.TouchEvent): void; selectRegistrationMode(event: WechatMiniprogram.TouchEvent): void;
  onCapacityChange(event: WechatMiniprogram.CustomEvent<{ value: string }>): void; onCourtChange(event: WechatMiniprogram.CustomEvent<{ value: string }>): void;
  onScoreChange(event: WechatMiniprogram.CustomEvent<{ value: string }>): void; onRoundChange(event: WechatMiniprogram.CustomEvent<{ value: string }>): void;
  onLevelChange(event: WechatMiniprogram.CustomEvent<{ value: string }>): void; onManualNumberInput(event: WechatMiniprogram.Input): void;
  onManualNicknameInput(event: WechatMiniprogram.Input): void; selectManualGender(event: WechatMiniprogram.TouchEvent): void;
  addManualParticipant(): void; onParticipantNumberBlur(event: WechatMiniprogram.Input): void; removeManualParticipant(event: WechatMiniprogram.TouchEvent): void;
  saveCurrentDraft(): Promise<void>; startCurrentEvent(): Promise<void>; cancelChanges(): void;
}

Page<EventDraftData, EventCreateMethods>({
  data: {
    draftId: '', title: '', description: '', matchFormat: MatchFormat.Doubles, registrationMode: RegistrationMode.WechatSelfService,
    capacity: 8, capacityOptions: getCapacityOptions(MatchFormat.Doubles), capacityIndex: 4,
    courtCount: 1, courtOptions: COURT_OPTIONS, courtIndex: 0, scoreTo: 21, scoreOptions: SCORE_OPTIONS, scoreIndex: 2,
    rounds: 10, roundOptions: ROUND_OPTIONS, roundIndex: 9, recommendedRounds: 10,
    levelOptions: LEVEL_OPTIONS, manualNumber: '1', manualNickname: '', manualGender: '', manualLevel: '', manualLevelIndex: 0,
    manualParticipants: [], submitting: false, draftLimitReached: false,
  },
  onLoad(query) {
    this.setData({ draftLimitReached: listDrafts().length >= 3 });
    if (!query.draftId) return;
    const draft = getDraft(query.draftId);
    if (!draft) { void wx.showToast({ title: '草稿不存在或已删除', icon: 'none' }); return; }
    applyDraftToPage(this, draft);
  },
  onTitleInput(event) { this.setData({ title: event.detail.value }); },
  onDescriptionInput(event) { this.setData({ description: event.detail.value }); },
  selectFormat(event) {
    const matchFormat = event.currentTarget.dataset.format as MatchFormat;
    const capacityOptions = getCapacityOptions(matchFormat);
    const currentCapacity = this.data.capacity ?? capacityOptions[0] ?? 2;
    const capacity = capacityOptions.includes(currentCapacity) ? currentCapacity : capacityOptions[0] ?? 2;
    this.setData({ matchFormat, capacityOptions, capacity, capacityIndex: Math.max(0, capacityOptions.indexOf(capacity)), recommendedRounds: 10 });
  },
  selectRegistrationMode(event) { this.setData({ registrationMode: event.currentTarget.dataset.mode as RegistrationMode, recommendedRounds: 10 }); },
  onCapacityChange(event) { const capacityIndex = Number(event.detail.value); const capacity = this.data.capacityOptions[capacityIndex]; if (capacity !== undefined) this.setData({ capacity, capacityIndex }); },
  onCourtChange(event) { const courtIndex = Number(event.detail.value); const courtCount = COURT_OPTIONS[courtIndex]; if (courtCount !== undefined) this.setData({ courtCount, courtIndex }); },
  onScoreChange(event) { const scoreIndex = Number(event.detail.value); const scoreTo = SCORE_OPTIONS[scoreIndex]; if (scoreTo !== undefined) this.setData({ scoreTo, scoreIndex }); },
  onRoundChange(event) { const roundIndex = Number(event.detail.value); const rounds = ROUND_OPTIONS[roundIndex]; if (rounds !== undefined) this.setData({ rounds, roundIndex }); },
  onLevelChange(event) { const manualLevelIndex = Number(event.detail.value); this.setData({ manualLevelIndex, manualLevel: manualLevelIndex === 0 ? '' : LEVEL_OPTIONS[manualLevelIndex] ?? '' }); },
  onManualNumberInput(event) { this.setData({ manualNumber: event.detail.value }); },
  onManualNicknameInput(event) { this.setData({ manualNickname: event.detail.value }); },
  selectManualGender(event) { this.setData({ manualGender: event.currentTarget.dataset.gender as Gender }); },
  addManualParticipant() {
    const participantNumber = this.data.manualNumber.trim(); const nickname = this.data.manualNickname.trim(); const gender = this.data.manualGender;
    if (!isValidNumber(participantNumber)) { void wx.showToast({ title: '编号必须是大于 0 的数字', icon: 'none' }); return; }
    if (!nickname || nickname.length > 20) { void wx.showToast({ title: '昵称需要 1～20 个字符', icon: 'none' }); return; }
    if (!gender) { void wx.showToast({ title: '请选择性别', icon: 'none' }); return; }
    if (hasDuplicateNumber(this.data.manualParticipants, participantNumber)) { void wx.showToast({ title: '编号不能重复', icon: 'none' }); return; }
    if (hasDuplicateNickname(this.data.manualParticipants, nickname)) { void wx.showToast({ title: '昵称不能重复', icon: 'none' }); return; }
    const participant: LocalManualParticipant = {
      localId: `participant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      participantNumber, nickname, gender, level: this.data.manualLevel || undefined,
    };
    const manualParticipants = [...this.data.manualParticipants, participant];
    this.setData({ manualParticipants, manualNumber: getNextParticipantNumber(manualParticipants), manualNickname: '', manualGender: '', manualLevel: '', manualLevelIndex: 0 });
  },
  onParticipantNumberBlur(event) {
    const localId = String(event.currentTarget.dataset.id); const participantNumber = event.detail.value.trim();
    const duplicate = hasDuplicateNumber(this.data.manualParticipants, participantNumber, localId);
    if (!isValidNumber(participantNumber) || duplicate) {
      void wx.showToast({ title: duplicate ? '编号不能重复' : '编号必须是大于 0 的数字', icon: 'none' });
      this.setData({ manualParticipants: [...this.data.manualParticipants] }); return;
    }
    const manualParticipants = this.data.manualParticipants.map((item) => item.localId === localId ? { ...item, participantNumber } : item);
    this.setData({ manualParticipants, manualNumber: getNextParticipantNumber(manualParticipants) });
  },
  removeManualParticipant(event) {
    const localId = String(event.currentTarget.dataset.id);
    const manualParticipants = this.data.manualParticipants.filter((item) => item.localId !== localId);
    this.setData({ manualParticipants, manualNumber: getNextParticipantNumber(manualParticipants) });
  },
  async saveCurrentDraft() {
    if (this.data.submitting) return;
    const input = buildInput(this.data); if (!input) return;
    this.setData({ submitting: true });
    try { const draft = saveDraft(input, this.data.draftId || undefined); void wx.redirectTo({ url: `/pages/draft-detail/index?id=${draft.id}` }); }
    catch (error) { void wx.showToast({ title: error instanceof DraftLimitError ? error.message : '草稿保存失败', icon: 'none' }); }
    finally { this.setData({ submitting: false }); }
  },
  cancelChanges() { void wx.navigateBack({ delta: 1 }); },
  async startCurrentEvent() {
    if (this.data.submitting) return;
    const input = buildInput(this.data); if (!input) return;
    const direct = input.registrationMode === RegistrationMode.OrganizerManaged;
    const modal = await wx.showModal({
      title: direct ? '开始球局' : '发起球局',
      content: direct ? `将按 ${input.manualParticipants.length} 人生成 ${input.rounds} 轮对阵并直接开始，是否继续？` : '球局将进入报名中并可分享给球友，是否继续？',
    });
    if (!modal.confirm) return;
    this.setData({ submitting: true }); void wx.showLoading({ title: '正在创建', mask: true });
    try {
      const event = await createEvent(input);
      if (this.data.draftId) deleteDraft(this.data.draftId);
      void wx.redirectTo({ url: `/pages/event-detail/index?eventId=${event.id}` });
    } catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '发起失败', icon: 'none' }); }
    finally { wx.hideLoading(); this.setData({ submitting: false }); }
  },
});

function buildInput(data: EventDraftData): EventDraftInput | undefined {
  const title = data.title.trim(); const description = data.description.trim();
  if (!title) { void wx.showToast({ title: '请填写球局名称', icon: 'none' }); return undefined; }
  if (description.length > 500) { void wx.showToast({ title: '比赛说明不能超过 500 字', icon: 'none' }); return undefined; }
  if (data.registrationMode === RegistrationMode.OrganizerManaged) {
    const minimum = data.matchFormat === MatchFormat.Singles ? 2 : 4;
    const label = data.matchFormat === MatchFormat.Singles ? '单打' : data.matchFormat === MatchFormat.MixedDoubles ? '双打混双' : '双打';
    if (data.manualParticipants.length < minimum) { void wx.showToast({ title: `${label}至少录入 ${minimum} 人`, icon: 'none' }); return undefined; }
    if (data.matchFormat === MatchFormat.MixedDoubles) {
      const men = data.manualParticipants.filter((item) => item.gender === Gender.Male).length;
      const women = data.manualParticipants.filter((item) => item.gender === Gender.Female).length;
      if (men !== women) { void wx.showToast({ title: `混双要求男女人数相等，当前男 ${men} 人、女 ${women} 人`, icon: 'none' }); return undefined; }
      const supportedCourts = Math.floor(Math.min(men, women) / 2);
      if (data.courtCount > supportedCourts) { void wx.showToast({ title: `当前男女比例最多支持 ${supportedCourts} 块场地`, icon: 'none' }); return undefined; }
    } else if (data.courtCount > Math.floor(data.manualParticipants.length / minimum)) {
      void wx.showToast({ title: `当前人数最多支持 ${Math.floor(data.manualParticipants.length / minimum)} 块场地`, icon: 'none' }); return undefined;
    }
    if (new Set(data.manualParticipants.map((item) => normalize(item.nickname))).size !== data.manualParticipants.length) { void wx.showToast({ title: '手动录入的昵称不能重复', icon: 'none' }); return undefined; }
  }
  return {
    title, description: description || undefined, matchFormat: data.matchFormat, registrationMode: data.registrationMode,
    capacity: data.registrationMode === RegistrationMode.OrganizerManaged ? data.manualParticipants.length : data.capacity,
    courtCount: data.courtCount, scoreTo: data.scoreTo, rounds: data.rounds,
    manualParticipants: data.registrationMode === RegistrationMode.OrganizerManaged ? data.manualParticipants : [],
  };
}
function getCapacityOptions(format: MatchFormat): number[] {
  const minimum = format === MatchFormat.Singles ? 2 : 4;
  const values = Array.from({ length: 65 - minimum }, (_, index) => minimum + index);
  return format === MatchFormat.MixedDoubles ? values.filter((value) => value % 2 === 0) : values;
}
function getNextParticipantNumber(participants: readonly LocalManualParticipant[]): string { const numbers = participants.map((item) => Number(item.participantNumber)).filter((value) => Number.isInteger(value) && value > 0); return String((numbers.length ? Math.max(...numbers) : 0) + 1); }
function isValidNumber(value: string): boolean { return /^[1-9]\d*$/.test(value); }
function normalize(value: string): string { return value.trim().toLocaleLowerCase('zh-CN'); }
function hasDuplicateNumber(participants: readonly LocalManualParticipant[], value: string, excludedId?: string): boolean { return participants.some((item) => item.localId !== excludedId && item.participantNumber === value); }
function hasDuplicateNickname(participants: readonly LocalManualParticipant[], value: string): boolean { const key = normalize(value); return participants.some((item) => normalize(item.nickname) === key); }
function applyDraftToPage(page: WechatMiniprogram.Page.Instance<EventDraftData, EventCreateMethods>, draft: EventDraftRecord): void {
  const capacityOptions = getCapacityOptions(draft.matchFormat); const capacity = draft.capacity ?? draft.manualParticipants.length;
  page.setData({
    draftId: draft.id, title: draft.title, description: draft.description ?? '', matchFormat: draft.matchFormat,
    registrationMode: draft.registrationMode, capacity, capacityOptions, capacityIndex: Math.max(0, capacityOptions.indexOf(capacity)),
    courtCount: draft.courtCount, courtIndex: Math.max(0, COURT_OPTIONS.indexOf(draft.courtCount)),
    scoreTo: draft.scoreTo, scoreIndex: Math.max(0, SCORE_OPTIONS.indexOf(draft.scoreTo)), rounds: draft.rounds,
    roundIndex: Math.max(0, draft.rounds - 1), recommendedRounds: 10, manualParticipants: draft.manualParticipants,
    manualNumber: getNextParticipantNumber(draft.manualParticipants), draftLimitReached: false,
  });
}



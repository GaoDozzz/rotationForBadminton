import { MatchFormat, RegistrationMode } from '../../shared/contracts';
import type { EventDraftRecord } from '../../shared/models';
import { deleteDraft, getDraft } from '../../services/draft-service';
import { createEvent } from '../../services/event-api';
import { isOfflineMode } from '../../services/runtime-mode';

interface DraftDetailData { draft?: EventDraftRecord; formatLabel: string; registrationLabel: string; submitting: boolean; offlineMode: boolean; }
interface DraftDetailMethods { editDraft(): void; deleteCurrentDraft(): Promise<void>; publishDraft(): Promise<void>; }

Page<DraftDetailData, DraftDetailMethods>({
  data: { formatLabel: '', registrationLabel: '', submitting: false, offlineMode: false },
  onLoad(query) {
    const draft = query.id ? getDraft(query.id) : undefined;
    if (!draft) { void wx.showToast({ title: '草稿不存在或已删除', icon: 'none' }); return; }
    this.setData({ draft, offlineMode: isOfflineMode(), formatLabel: draft.matchFormat === MatchFormat.Singles ? '单打' : draft.matchFormat === MatchFormat.MixedDoubles ? '双打混双' : '双打', registrationLabel: draft.registrationMode === RegistrationMode.OrganizerManaged ? '组织者录入' : '微信自主报名' });
  },
  editDraft() { if (this.data.draft) void wx.navigateTo({ url: `/pages/event-create/index?draftId=${this.data.draft.id}` }); },
  async deleteCurrentDraft() { if (!this.data.draft || this.data.submitting) return; const result = await wx.showModal({ title: '删除草稿', content: '删除后无法恢复，是否继续？' }); if (!result.confirm) return; deleteDraft(this.data.draft.id); void wx.reLaunch({ url: '/pages/home/index' }); },
  async publishDraft() {
    const draft = this.data.draft; if (!draft || this.data.submitting) return;
    if (this.data.offlineMode && draft.registrationMode === RegistrationMode.WechatSelfService) { void wx.showToast({ title: '离线模式无法使用微信自主报名，请先编辑为组织者录入', icon: 'none' }); return; }
    const direct = draft.registrationMode === RegistrationMode.OrganizerManaged;
    const result = await wx.showModal({ title: direct ? '直接开始球局' : '发布报名球局', content: direct ? `将按已录入的 ${draft.manualParticipants.length} 人生成 ${draft.rounds} 轮对阵并直接开始，是否继续？` : '发布后球局进入报名中，并可分享给球友报名，是否继续？' });
    if (!result.confirm) return;
    this.setData({ submitting: true }); void wx.showLoading({ title: '正在发布', mask: true });
    try { const event = await createEvent(draft); deleteDraft(draft.id); void wx.redirectTo({ url: `/pages/event-detail/index?eventId=${event.id}` }); }
    catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '发布失败', icon: 'none' }); }
    finally { wx.hideLoading(); this.setData({ submitting: false }); }
  },
});


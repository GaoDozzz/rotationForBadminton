import { Gender } from '../../shared/contracts';
import type { ApiEventRecord } from '../../shared/models';
import { getSharedEvent, joinEvent } from '../../services/event-api';

const LEVEL_OPTIONS = ['请选择水平（选填）', ...Array.from({ length: 15 }, (_, index) => `L${1 + index * 0.5}`)];
interface RegistrationData { shareCode: string; event?: ApiEventRecord; nickname: string; gender: Gender | ''; level: string; levelIndex: number; levelOptions: string[]; submitting: boolean; }
interface RegistrationMethods { onNicknameInput(event: WechatMiniprogram.Input): void; selectGender(event: WechatMiniprogram.TouchEvent): void; onLevelChange(event: WechatMiniprogram.CustomEvent<{ value: string }>): void; submitRegistration(): Promise<void>; }

Page<RegistrationData, RegistrationMethods>({
  data: { shareCode: '', nickname: '', gender: '', level: '', levelIndex: 0, levelOptions: LEVEL_OPTIONS, submitting: false },
  onLoad(query) { if (!query.shareCode) { void wx.showToast({ title: '分享链接无效', icon: 'none' }); return; } this.setData({ shareCode: query.shareCode }); void getSharedEvent(query.shareCode).then((event) => this.setData({ event })).catch((error: unknown) => wx.showToast({ title: error instanceof Error ? error.message : '球局加载失败', icon: 'none' })); },
  onNicknameInput(event) { this.setData({ nickname: event.detail.value }); },
  selectGender(event) { this.setData({ gender: event.currentTarget.dataset.gender as Gender }); },
  onLevelChange(event) { const levelIndex = Number(event.detail.value); this.setData({ levelIndex, level: levelIndex === 0 ? '' : LEVEL_OPTIONS[levelIndex] ?? '' }); },
  async submitRegistration() {
    if (this.data.submitting) return; const nickname = this.data.nickname.trim();
    if (!nickname || !this.data.gender) { void wx.showToast({ title: '请填写昵称并选择性别', icon: 'none' }); return; }
    this.setData({ submitting: true });
    try { await joinEvent(this.data.shareCode, { nickname, gender: this.data.gender, level: this.data.level || undefined }); await wx.showModal({ title: '报名成功', content: '你已加入球局，满员时系统会自动进入等位区。', showCancel: false }); if (this.data.event) void wx.redirectTo({ url: `/pages/event-detail/index?eventId=${this.data.event.id}` }); }
    catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '报名失败', icon: 'none' }); }
    finally { this.setData({ submitting: false }); }
  },
});

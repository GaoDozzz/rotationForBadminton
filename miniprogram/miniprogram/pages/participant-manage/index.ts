import type { ApiEventRecord } from '../../shared/models';
import { getEvent } from '../../services/event-api';
import { confirmWithdraw, previewWithdraw } from '../../services/event-actions-api';

interface ManageData { eventId: string; event?: ApiEventRecord; submittingId: string; }
interface ManageMethods { load(): Promise<void>; withdraw(event: WechatMiniprogram.TouchEvent): Promise<void>; }

Page<ManageData, ManageMethods>({
  data: { eventId: '', submittingId: '' },
  onLoad(query) { if (!query.eventId) { void wx.showToast({ title: '缺少球局参数', icon: 'none' }); return; } this.setData({ eventId: query.eventId }); void this.load(); },
  async load() { try { this.setData({ event: await getEvent(this.data.eventId) }); } catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '名单加载失败', icon: 'none' }); } },
  async withdraw(event) {
    if (this.data.submittingId) return; const participantId = String(event.currentTarget.dataset.id); this.setData({ submittingId: participantId });
    try {
      const preview = await previewWithdraw(this.data.eventId, participantId);
      const result = await wx.showModal({ title: `确认 ${preview.participant.nickname} 临时退出`, content: preview.message });
      if (!result.confirm) return;
      void wx.showLoading({ title: '正在重新排阵', mask: true }); await confirmWithdraw(this.data.eventId, participantId); await this.load(); void wx.showToast({ title: '已退出并重排', icon: 'success' });
    } catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '退出失败', icon: 'none' }); }
    finally { wx.hideLoading(); this.setData({ submittingId: '' }); }
  },
});

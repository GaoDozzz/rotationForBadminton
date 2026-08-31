import { request } from '../../services/api-client';
import { deleteDraft, listDrafts } from '../../services/draft-service';
import { deleteEvent, listEvents } from '../../services/event-api';
import type { ApiEventRecord, EventDraftRecord } from '../../shared/models';

type Category = 'ALL' | 'IN_PROGRESS' | 'REGISTRATION_OPEN' | 'DRAFT' | 'FINISHED';
interface HomeData {
  serverStatus: 'checking' | 'online' | 'offline'; drafts: EventDraftRecord[]; events: ApiEventRecord[];
  inProgressEvents: ApiEventRecord[]; registrationEvents: ApiEventRecord[]; finishedEvents: ApiEventRecord[];
  activeCategory: Category; openRowKey: string; loading: boolean;
}
interface HomeMethods {
  loadData(): Promise<void>; checkServer(): Promise<void>; createEvent(): void; selectCategory(event: WechatMiniprogram.TouchEvent): void;
  openDraft(event: WechatMiniprogram.TouchEvent): void; openEvent(event: WechatMiniprogram.TouchEvent): void;
  editDraft(event: WechatMiniprogram.TouchEvent): void; removeDraft(event: WechatMiniprogram.TouchEvent): Promise<void>;
  removeEvent(event: WechatMiniprogram.TouchEvent): Promise<void>; onRowTouchStart(event: WechatMiniprogram.TouchEvent): void;
  onRowTouchEnd(event: WechatMiniprogram.TouchEvent): void; onDraftLongPress(event: WechatMiniprogram.TouchEvent): Promise<void>;
  onEventLongPress(event: WechatMiniprogram.TouchEvent): Promise<void>; closeActions(): void;
}

let gesture: { x: number; y: number; key: string } | undefined;

Page<HomeData, HomeMethods>({
  data: { serverStatus: 'checking', drafts: [], events: [], inProgressEvents: [], registrationEvents: [], finishedEvents: [], activeCategory: 'ALL', openRowKey: '', loading: false },
  onShow() { void this.loadData(); },
  async loadData() {
    this.setData({ loading: true, drafts: listDrafts() });
    try {
      const events = await listEvents();
      this.setData({ events, inProgressEvents: events.filter((item) => item.status === 'IN_PROGRESS'), registrationEvents: events.filter((item) => ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'SCHEDULE_READY'].includes(item.status)), finishedEvents: events.filter((item) => item.status === 'FINISHED'), serverStatus: 'online' });
    } catch { this.setData({ serverStatus: 'offline' }); }
    finally { this.setData({ loading: false }); }
  },
  async checkServer() { try { await request({ path: '/health/live' }); this.setData({ serverStatus: 'online' }); } catch { this.setData({ serverStatus: 'offline' }); } },
  createEvent() { if (this.data.drafts.length >= 3) void wx.showToast({ title: '草稿已满，仍可直接发起球局', icon: 'none' }); void wx.navigateTo({ url: '/pages/event-create/index' }); },
  selectCategory(event) { this.setData({ activeCategory: event.currentTarget.dataset.category as Category, openRowKey: '' }); },
  openDraft(event) { if (this.data.openRowKey) { this.closeActions(); return; } void wx.navigateTo({ url: `/pages/draft-detail/index?id=${String(event.currentTarget.dataset.id)}` }); },
  openEvent(event) { if (this.data.openRowKey) { this.closeActions(); return; } void wx.navigateTo({ url: `/pages/event-detail/index?eventId=${String(event.currentTarget.dataset.id)}` }); },
  editDraft(event) { const id = String(event.currentTarget.dataset.id); this.closeActions(); void wx.navigateTo({ url: `/pages/event-create/index?draftId=${id}` }); },
  async removeDraft(event) { const id = String(event.currentTarget.dataset.id); const result = await wx.showModal({ title: '删除草稿', content: '删除后无法恢复，是否继续？' }); if (!result.confirm) return; deleteDraft(id); this.closeActions(); await this.loadData(); },
  async removeEvent(event) { const id = String(event.currentTarget.dataset.id); const result = await wx.showModal({ title: '删除球局', content: '是否确认删除该球局？' }); if (!result.confirm) return; try { await deleteEvent(id); this.closeActions(); await this.loadData(); } catch (error) { void wx.showToast({ title: error instanceof Error ? error.message : '删除失败', icon: 'none' }); } },
  onRowTouchStart(event) { const touch = event.touches[0]; if (!touch) return; gesture = { x: touch.clientX, y: touch.clientY, key: String(event.currentTarget.dataset.key) }; },
  onRowTouchEnd(event) { const touch = event.changedTouches[0]; if (!touch || !gesture) return; const dx = touch.clientX - gesture.x; const dy = touch.clientY - gesture.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) this.setData({ openRowKey: dx < 0 ? gesture.key : '' }); gesture = undefined; },
  async onDraftLongPress(event) {
    const id = String(event.currentTarget.dataset.id);
    try {
      const result = await wx.showActionSheet({ itemList: ['编辑', '删除'] });
      if (result.tapIndex === 0) void wx.navigateTo({ url: `/pages/event-create/index?draftId=${id}` });
      else if (result.tapIndex === 1) await this.removeDraft({ currentTarget: { dataset: { id } } } as unknown as WechatMiniprogram.TouchEvent);
    } catch (error) {
      // 点击“取消”时微信会以 fail cancel 拒绝 Promise，这是正常交互，不应上报为业务错误。
      if (!isActionSheetCancel(error)) void wx.showToast({ title: '操作菜单打开失败', icon: 'none' });
    }
  },
  async onEventLongPress(event) {
    const id = String(event.currentTarget.dataset.id);
    try {
      const result = await wx.showActionSheet({ itemList: ['删除'] });
      if (result.tapIndex === 0) await this.removeEvent({ currentTarget: { dataset: { id } } } as unknown as WechatMiniprogram.TouchEvent);
    } catch (error) {
      if (!isActionSheetCancel(error)) void wx.showToast({ title: '操作菜单打开失败', icon: 'none' });
    }
  },
  closeActions() { this.setData({ openRowKey: '' }); },
});

function isActionSheetCancel(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const errMsg = 'errMsg' in error ? String((error as { errMsg?: unknown }).errMsg ?? '') : '';
  return errMsg.includes('showActionSheet:fail cancel');
}

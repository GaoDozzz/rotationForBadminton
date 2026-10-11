import { importEvent, listEvents } from '../../services/event-api';
import { listDrafts } from '../../services/draft-service';
import { parseEventTransfer, suggestedImportTitle, type EventTransfer } from '../../shared/event-transfer';
import { isOfflineMode } from '../../services/runtime-mode';

interface Data { text: string; title: string; summary: string; preview?: EventTransfer; submitting: boolean; offlineMode: boolean; }
interface Methods { onTextInput(event: WechatMiniprogram.TextareaInput): void; onTitleInput(event: WechatMiniprogram.Input): void; pasteText(): Promise<void>; previewImport(): void; confirmImport(): Promise<void>; }

Page<Data, Methods>({
  data: { text: '', title: '', summary: '', submitting: false, offlineMode: false },
  onLoad() { this.setData({ offlineMode: isOfflineMode() }); },
  onTextInput(event) { this.setData({ text: event.detail.value, preview: undefined }); },
  onTitleInput(event) { this.setData({ title: event.detail.value }); },
  async pasteText() {
    try { const result = await wx.getClipboardData(); this.setData({ text: result.data, preview: undefined }); }
    catch { void wx.showToast({ title: '剪贴板读取失败，请手动粘贴', icon: 'none' }); }
  },
  previewImport() {
    try {
      const preview = parseEventTransfer(this.data.text);
      const finished = preview.matches.filter((m) => ['COMPLETED', 'WALKOVER'].includes(m.status)).length;
      this.setData({ preview, title: preview.title, summary: `${preview.participants.length} 人 · ${preview.rounds} 轮 · ${preview.matches.length} 场（已结束 ${finished} 场）· ${preview.scoreTo} 分制` });
    } catch (error) { void wx.showModal({ title: '无法解析对阵', content: error instanceof Error ? error.message : '格式无效', showCancel: false }); }
  },
  async confirmImport() {
    if (!this.data.preview || this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      let title = this.data.title.trim();
      if (!title || title.length > 40) throw new Error('球局名称必须为 1～40 字');
      // 在线查当前用户的球局，离线查当前会话；草稿也参与名称检查。
      // 后端仍独立检查，防止预览之后他处新建同名球局导致覆盖或重复导入。
      const names = [...(await listEvents()).map((event) => event.title.trim()), ...listDrafts().map((draft) => draft.title.trim())];
      while (names.includes(title)) {
        const result = await wx.showModal({ title: '球局名称已存在', content: '请填写新名称后导入，或取消本次导入。', editable: true, placeholderText: suggestedImportTitle(title, names), confirmText: '使用新名称' });
        if (!result.confirm) return;
        title = result.content?.trim() || suggestedImportTitle(title, names);
        if (!title || title.length > 40) throw new Error('新名称必须为 1～40 字');
        this.setData({ title });
      }
      const result = await wx.showModal({ title: '确认导入球局', content: `将创建“${title}”，保留原人员、对阵及比分并重新计算排名。${this.data.offlineMode ? '离线数据在退出离线模式时清除。' : ''}` });
      if (!result.confirm) return;
      const event = await importEvent({ ...this.data.preview, title });
      void wx.redirectTo({ url: `/pages/event-detail/index?eventId=${event.id}` });
    } catch (error) { void wx.showModal({ title: '导入失败', content: error instanceof Error ? error.message : '请重试', showCancel: false }); }
    finally { this.setData({ submitting: false }); }
  },
});

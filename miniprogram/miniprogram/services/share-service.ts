export interface PosterInput {
  page: WechatMiniprogram.Component.TrivialInstance;
  canvasId: string;
  title: string;
  subtitle: string;
  lines: readonly string[];
  entrancePath: string;
}

export async function copyShareText(text: string): Promise<void> {
  await wx.setClipboardData({ data: text });
  void wx.showToast({ title: '文字已复制', icon: 'success' });
}

/**
 * 使用旧版 CanvasContext 是有意选择：它在微信开发者工具、iOS 和 Android 的
 * 基础库 2.x/3.x 中行为一致。海报先导出为本地临时 PNG，再交给微信原生图片
 * 分享菜单；如果桌面开发者工具不支持分享菜单，仍会预览图片供检查。
 */
export async function buildAndSharePoster(input: PosterInput): Promise<void> {
  const width = 375; const limited = input.lines.slice(0, 28);
  const height = Math.min(880, 190 + limited.length * 24 + (input.lines.length > limited.length ? 36 : 0));
  const context = wx.createCanvasContext(input.canvasId, input.page);
  context.setFillStyle('#f3f7f5'); context.fillRect(0, 0, width, height);
  context.setFillStyle('#0f9f68'); context.fillRect(0, 0, width, 118);
  context.setFillStyle('#ffffff'); context.setFontSize(22); context.fillText(ellipsis(input.title, 22), 24, 48);
  context.setFontSize(13); context.fillText(ellipsis(input.subtitle, 38), 24, 80);
  context.setFontSize(11); context.fillText('转转接龙 · 公平轮转，轻松开打', 24, 102);
  context.setFillStyle('#172b24'); context.setFontSize(14);
  limited.forEach((line, index) => context.fillText(ellipsis(line, 42), 24, 154 + index * 24));
  if (input.lines.length > limited.length) { context.setFillStyle('#667085'); context.fillText('更多内容请进入小程序查看', 24, 164 + limited.length * 24); }
  context.setFillStyle('#0f9f68'); context.fillRect(24, height - 28, width - 48, 2);

  const tempFilePath = await new Promise<string>((resolve, reject) => {
    context.draw(false, () => {
      wx.canvasToTempFilePath({ canvasId: input.canvasId, width, height, destWidth: width * 2, destHeight: height * 2, fileType: 'png', quality: 1, success: (result) => resolve(result.tempFilePath), fail: reject }, input.page);
    });
  });
  try {
    await wx.showShareImageMenu({ path: tempFilePath, needShowEntrance: true, entrancePath: input.entrancePath });
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes('cancel')) return;
    await wx.previewImage({ urls: [tempFilePath] });
    void wx.showToast({ title: '已生成图片，可长按保存', icon: 'none' });
  }
}

export function isActionSheetCancel(error: unknown): boolean { return getErrorMessage(error).includes('showActionSheet:fail cancel'); }
function getErrorMessage(error: unknown): string { return error && typeof error === 'object' && 'errMsg' in error ? String((error as { errMsg?: unknown }).errMsg ?? '') : error instanceof Error ? error.message : ''; }
function ellipsis(value: string, length: number): string { return value.length > length ? `${value.slice(0, Math.max(1, length - 1))}…` : value; }

import { layoutPoster, wrapPosterText, type MatchPosterRow } from './match-share';
import type { ApiRankingEntry } from '../shared/models';

export interface PosterInput {
  page: WechatMiniprogram.Component.TrivialInstance;
  canvasId: string;
  title: string;
  subtitle: string;
  lines: readonly string[];
  matchRows?: readonly MatchPosterRow[];
  rankingRows?: readonly ApiRankingEntry[];
  entrancePath?: string;
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
  const titleLines = wrapPosterText(input.title, 18);
  const subtitleY = 34 + (titleLines.length - 1) * 22 + 28;
  const headerHeight = subtitleY + 22;
  // 常见 12/20 轮优先导出一张完整长图；极大球局再分页，不能截断场次。
  // 导出按 2 倍分辨率，单页限制 4096 逻辑像素，避免无限增高造成画布内存不足。
  const width = 375; const pages = layoutPoster(input.lines, input.matchRows, headerHeight, 4096, input.rankingRows); const paths: string[] = [];
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index]!;
    // 必须先同步实际画布尺寸再绘制，否则扩大导出区域也会被原 880px 画布裁掉。
    await new Promise<void>((resolve) => input.page.setData({ posterCanvasHeight: page.height }, resolve));
    const context = wx.createCanvasContext(input.canvasId, input.page);
    context.setFillStyle('#f3f7f5'); context.fillRect(0, 0, width, page.height);
    context.setFillStyle('#0f9f68'); context.fillRect(0, 0, width, headerHeight);
    context.setFillStyle('#ffffff'); context.setFontSize(18);
    titleLines.forEach((line, row) => context.fillText(line, 24, 34 + row * 22));
    context.setFontSize(11); context.fillText(input.subtitle, 24, subtitleY);
    context.setFillStyle('#64746c'); context.setFontSize(10);
    context.fillText('转转接龙 · ' + (index + 1) + '/' + pages.length, 24, page.height - 14);
    let y = headerHeight + 20;
    for (const block of page.blocks) {
      if (block.kind === 'round') {
        context.setFillStyle('#e1f1e8'); context.fillRect(20, y, 335, 26);
        context.setFillStyle('#087a4b'); context.setFontSize(13); context.setTextAlign('left');
        context.fillText(block.lines![0]!, 30, y + 18);
      } else if (block.kind === 'match') {
        context.setFillStyle('#ffffff'); context.fillRect(20, y, 335, block.height - 6);
        context.setFillStyle('#667085'); context.setFontSize(10); context.setTextAlign('left');
        context.fillText(block.row!.courtNumber + ' 号场', 30, y + 17);
        context.setTextAlign('right'); context.fillText(block.row!.status, 345, y + 17);
        context.setTextAlign('left'); context.setFontSize(12); context.setFillStyle('#24362d');
        block.teamA!.forEach((line, row) => context.fillText(line, 30, y + 40 + row * 18));
        block.teamB!.forEach((line, row) => context.fillText(line, 237, y + 40 + row * 18));
        const scoreY = y + 40 + (Math.max(block.teamA!.length, block.teamB!.length) - 1) * 9;
        const score = block.row!.score.split(':');
        context.setFontSize(18); context.setTextAlign('right'); context.setFillStyle(block.row!.winner === 'A' ? '#087a4b' : '#667085');
        context.fillText(score[0]!.trim(), 177, scoreY);
        context.setTextAlign('center'); context.setFillStyle('#98a2b3'); context.fillText(':', 188, scoreY);
        context.setTextAlign('left'); context.setFillStyle(block.row!.winner === 'B' ? '#087a4b' : '#667085');
        context.fillText(score[1]!.trim(), 199, scoreY);
        context.setTextAlign('left');
      } else if (block.kind === 'ranking') {
        const ranking = block.ranking!;
        context.setFillStyle('#ffffff'); context.fillRect(20, y, 335, block.height - 6);
        context.setFillStyle(ranking.rank <= 3 ? '#e1f1e8' : '#edf0ef'); context.fillRect(28, y + 12, 28, 28);
        context.setFillStyle('#087a4b'); context.setFontSize(14); context.setTextAlign('center');
        context.fillText(String(ranking.rank), 42, y + 32);
        context.setTextAlign('left'); context.setFillStyle('#24362d'); context.setFontSize(13);
        block.lines!.forEach((line, row) => context.fillText(line, 66, y + 29 + row * 18));
        context.setTextAlign('right'); context.setFillStyle(ranking.points < 0 ? '#e5484d' : '#087a4b'); context.setFontSize(17);
        context.fillText((ranking.points > 0 ? '+' : '') + ranking.points + ' 分', 345, y + 31);
        context.setTextAlign('left'); context.setFillStyle('#667085'); context.setFontSize(11);
        const metaY = y + 42 + block.lines!.length * 18;
        context.fillText(`${ranking.matchesPlayed} 场 · ${ranking.wins} 胜 ${ranking.losses} 负`, 30, metaY);
        context.setTextAlign('right'); context.fillText(`得 ${ranking.scored} / 失 ${ranking.conceded}`, 345, metaY);
        context.setTextAlign('left');
      } else {
        context.setFillStyle('#24362d'); context.setFontSize(14); context.setTextAlign('left');
        block.lines!.forEach((line, row) => context.fillText(line, 24, y + 18 + row * 22));
      }
      y += block.height;
    }
    const path = await new Promise<string>((resolve, reject) => {
      context.draw(false, () => wx.canvasToTempFilePath({
        canvasId: input.canvasId, width, height: page.height, destWidth: width * 2, destHeight: page.height * 2,
        fileType: 'png', quality: 1, success: (result) => resolve(result.tempFilePath), fail: reject,
      }, input.page));
    });
    paths.push(path);
  }
  if (paths.length > 1) {
    const result = await wx.showModal({ title: '对阵图片已生成', content: `内容较多，共 ${paths.length} 张完整图片。确认后依次打开微信分享菜单，取消分享可查看全部图片。`, confirmText: '依次分享' });
    if (!result.confirm) { await wx.previewImage({ urls: paths }); return; }
  }
  // 微信单次只接受一张图；多页也逐张打开原生菜单，不再退化为仅预览。
  for (const path of paths) {
    try {
      await wx.showShareImageMenu(input.entrancePath
        ? { path, needShowEntrance: true, entrancePath: input.entrancePath }
        : { path, needShowEntrance: false });
    } catch (error) {
      if (getErrorMessage(error).includes('cancel') && paths.length === 1) return;
      await wx.previewImage({ urls: paths });
      if (!getErrorMessage(error).includes('cancel')) void wx.showToast({ title: '已生成图片，可长按分享', icon: 'none' });
      return;
    }
  }
}

export function isActionSheetCancel(error: unknown): boolean { return getErrorMessage(error).includes('showActionSheet:fail cancel'); }
function getErrorMessage(error: unknown): string { return error && typeof error === 'object' && 'errMsg' in error ? String((error as { errMsg?: unknown }).errMsg ?? '') : error instanceof Error ? error.message : ''; }

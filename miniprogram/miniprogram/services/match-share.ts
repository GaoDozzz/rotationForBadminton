import type { ApiEventRecord, ApiMatchRecord, ApiRankingEntry } from '../shared/models';
import { formatEventTransfer, type EventTransfer } from '../shared/event-transfer';

export function completeEventShare(event: ApiEventRecord, allMatches: readonly ApiMatchRecord[]): string {
  const rows = allMatches.map((m) => {
    if (m.status === 'SCORE_DISPUTED') throw new Error('有争议的比分请处理后再导出完整对阵');
    const side = (value: 'A' | 'B') => m.players.filter((p) => p.side === value).sort((a, b) => a.position - b.position).map((p) => p.participant.participantNumber);
    return { roundNumber: m.roundNumber, courtNumber: m.courtNumber, teamA: side('A'), teamB: side('B'), teamAScore: m.teamAScore ?? 0, teamBScore: m.teamBScore ?? 0, status: m.status };
  });
  return formatEventTransfer({
    version: 1, title: event.title, description: event.description, matchFormat: event.matchFormat,
    status: event.status, courtCount: event.courtCount, rounds: event.rounds, scoreTo: event.scoreTo, capacity: event.capacity,
    participants: event.participants ?? [], matches: rows,
  } as EventTransfer);
}
export interface MatchPosterRow { roundNumber: number; courtNumber: number; teamA: string; teamB: string; score: string; status: string; winner: '' | 'A' | 'B'; }
export function matchPosterRows(matches: readonly ApiMatchRecord[]): MatchPosterRow[] {
  const labels: Record<ApiMatchRecord['status'], string> = { SCHEDULED: '未开始', IN_PROGRESS: '比赛中', SCORE_PENDING: '待确认', SCORE_DISPUTED: '有争议', COMPLETED: '已结束', WALKOVER: '弃权结束', CANCELLED: '已取消' };
  return [...matches].sort((a, b) => a.roundNumber - b.roundNumber || a.courtNumber - b.courtNumber).map((m) => ({
    roundNumber: m.roundNumber, courtNumber: m.courtNumber,
    teamA: teamName(m, 'A'), teamB: teamName(m, 'B'), score: (m.teamAScore ?? 0) + ' : ' + (m.teamBScore ?? 0), status: labels[m.status],
    winner: ['COMPLETED', 'WALKOVER'].includes(m.status) && m.teamAScore !== m.teamBScore ? (m.teamAScore! > m.teamBScore! ? 'A' : 'B') : '',
  }));
}
function teamName(match: ApiMatchRecord, side: 'A' | 'B'): string { return match.players.filter((p) => p.side === side).sort((a, b) => a.position - b.position).map((p) => p.participant.participantNumber + '·' + p.participant.nickname).join(' / '); }

/** 按字符宽度保守换行，不省略长昵称；与 Canvas 使用的列宽保持一致。 */
export function wrapPosterText(text: string, units: number): string[] {
  const lines: string[] = []; let line = ''; let width = 0;
  for (const char of Array.from(text)) {
    if (char === '\n') { lines.push(line); line = ''; width = 0; continue; }
    const size = char.charCodeAt(0) <= 127 ? 0.58 : 1;
    if (width + size > units && line) { lines.push(line); line = ''; width = 0; }
    line += char; width += size;
  }
  lines.push(line); return lines;
}
export type PosterBlock = { kind: 'text' | 'round' | 'match' | 'ranking'; height: number; lines?: string[]; row?: MatchPosterRow; ranking?: ApiRankingEntry; teamA?: string[]; teamB?: string[]; };
export interface PosterPage { blocks: PosterBlock[]; height: number; }
/** 每页限制 880px，轮次标题与首场不分离，分页后补轮次标题，保证所有场次完整展示。 */
export function layoutPoster(lines: readonly string[], rows?: readonly MatchPosterRow[], headerHeight = 130, maxHeight = 880, rankings?: readonly ApiRankingEntry[]): PosterPage[] {
  const pages: PosterPage[] = []; let blocks: PosterBlock[] = []; let height = headerHeight + 20;
  const flush = () => { pages.push({ blocks, height: height + 40 }); blocks = []; height = headerHeight + 20; };
  const push = (block: PosterBlock) => { blocks.push(block); height += block.height; };
  if (rows) {
    let round = -1;
    for (const row of rows) {
      const a = wrapPosterText(row.teamA, 9); const b = wrapPosterText(row.teamB, 9);
      const block: PosterBlock = { kind: 'match', height: 48 + Math.max(a.length, b.length) * 18, row, teamA: a, teamB: b };
      const heading = row.roundNumber !== round;
      if (height + block.height + (heading ? 32 : 0) + 40 > maxHeight && blocks.length) { flush(); round = -1; }
      if (round !== row.roundNumber) { push({ kind: 'round', height: 32, lines: ['第 ' + row.roundNumber + ' 轮'] }); round = row.roundNumber; }
      push(block);
    }
  } else if (rankings) {
    // 直接遍历排名页签的快照，不能按报名编号重排或从参赛名单补出排名。
    for (const ranking of rankings) {
      const names = wrapPosterText(ranking.participant.nickname, 15);
      const block: PosterBlock = { kind: 'ranking', height: 68 + names.length * 18, ranking, lines: names };
      if (height + block.height + 40 > maxHeight && blocks.length) flush();
      push(block);
    }
  } else for (const line of lines) {
    const wrapped = wrapPosterText(line, 23);
    const block: PosterBlock = { kind: 'text', height: wrapped.length * 22 + 10, lines: wrapped };
    if (height + block.height + 40 > maxHeight && blocks.length) flush();
    push(block);
  }
  if (blocks.length || !pages.length) flush();
  return pages;
}

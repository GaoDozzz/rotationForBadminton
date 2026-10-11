import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatEventTransfer, parseEventTransfer, suggestedImportTitle, isFinalTransferScore, type EventTransfer } from './event-transfer';
import { beginOfflineSession, importOfflineEvent, getOfflineEvent, listOfflineMatches, listOfflineRankings } from '../services/offline-session';
import { completeEventShare, layoutPoster, matchPosterRows } from '../services/match-share';

const fixture: EventTransfer = {
  version: 1, title: '周五 | 自由转', description: '地点：球馆\n请准时',
  matchFormat: 'MIXED_DOUBLES', status: 'IN_PROGRESS', courtCount: 1, rounds: 2, scoreTo: 21, capacity: 4,
  participants: [
    { participantNumber: '1', nickname: '张 | 三', gender: 'MALE', status: 'ACTIVE' },
    { participantNumber: '2', nickname: '李"四', gender: 'FEMALE', status: 'ACTIVE' },
    { participantNumber: '3', nickname: '王五', gender: 'MALE', status: 'WITHDRAWN', level: 'L3' },
    { participantNumber: '4', nickname: '赵六', gender: 'FEMALE', status: 'ACTIVE' },
  ],
  matches: [
    { roundNumber: 1, courtNumber: 1, teamA: ['1', '2'], teamB: ['3', '4'], teamAScore: 21, teamBScore: 18, status: 'COMPLETED' },
    { roundNumber: 2, courtNumber: 1, teamA: ['1', '4'], teamB: ['3', '2'], teamAScore: 0, teamBScore: 0, status: 'SCHEDULED' },
  ],
}
describe('complete event transfer', () => {
  it('uses 31 as the new cap for all targets, with first-to rules for the 31-point format', () => {
    for (const target of [11, 15, 21]) {
      expect(isFinalTransferScore(target, 31, 30)).toBe(true);
      expect(isFinalTransferScore(target, 31, 29)).toBe(true);
      expect(isFinalTransferScore(target, 30, 29)).toBe(false);
      expect(isFinalTransferScore(target, 31, 28)).toBe(false);
    }
    expect(isFinalTransferScore(31, 31, 20)).toBe(true);
    const data = structuredClone(fixture); data.matches[0]!.teamAScore = 31; data.matches[0]!.teamBScore = 30;
    expect(parseEventTransfer(formatEventTransfer(data))).toEqual(data);
    data.matches[0]!.teamAScore = 30; data.matches[0]!.teamBScore = 29;
    expect(parseEventTransfer(formatEventTransfer(data))).toEqual(data); // 兼容旧版已结束记录，不改变新计分规则。
  });
  it('round-trips escaped names, player states, settings and match states without account IDs', () => {
    const text = formatEventTransfer(fixture);
    expect(parseEventTransfer(text)).toEqual(fixture);
    expect(text).not.toContain('openid');
  });
  it('keeps the runtime mirror identical to the authoritative contract', () => {
    expect(readFileSync(new URL('./event-transfer.ts', import.meta.url), 'utf8')).toBe(readFileSync(new URL('../../../packages/contracts/src/event-transfer.ts', import.meta.url), 'utf8'));
  });
  it('rejects incomplete text, duplicate numbers, bad references, duplicate courts and invalid scores', () => {
    expect(() => parseEventTransfer(formatEventTransfer(fixture).split('\n').slice(0, -1).join('\n'))).toThrow();
    const missingRow = formatEventTransfer(fixture).split('\n').filter((line) => !line.startsWith('1号场')).join('\n');
    expect(() => parseEventTransfer(missingRow)).toThrow('不完整');
    for (const mutate of [
      (d: EventTransfer) => { d.participants[1]!.participantNumber = '1'; },
      (d: EventTransfer) => { d.matches[0]!.teamA = ['99', '2']; },
      (d: EventTransfer) => { d.matches[1]!.roundNumber = 1; },
      (d: EventTransfer) => { d.matches[0]!.teamAScore = 30; },
      (d: EventTransfer) => { d.matches[0]!.teamA = ['1', '3']; },
    ]) {
      const data = JSON.parse(JSON.stringify(fixture)) as EventTransfer; mutate(data);
      expect(() => formatEventTransfer(data)).toThrow();
    }
  });
  it('imports the original lineup and score, including withdrawn players, without regenerating', () => {
    beginOfflineSession([]);
    const event = importOfflineEvent(parseEventTransfer(formatEventTransfer(fixture)));
    expect(event.registrationMode).toBe('ORGANIZER_MANAGED');
    expect(getOfflineEvent(event.id).participants!.find((p) => p.participantNumber === '3')?.status).toBe('WITHDRAWN');
    expect(listOfflineMatches(event.id, 'ALL')).toHaveLength(2);
    expect(listOfflineRankings(event.id).find((p) => p.participant.participantNumber === '1')?.points).toBe(3);
    expect(parseEventTransfer(completeEventShare(event, listOfflineMatches(event.id, 'ALL')))).toEqual(fixture);
    expect(() => importOfflineEvent(fixture)).toThrow('名称');
    const renamed = importOfflineEvent({ ...fixture, title: suggestedImportTitle(fixture.title, [fixture.title]) });
    expect(renamed.id).not.toBe(event.id);
  });
  it('paginates every match and wraps full names without clipped rows', () => {
    beginOfflineSession([]); const event = importOfflineEvent(fixture);
    const base = matchPosterRows(listOfflineMatches(event.id, 'ALL'));
    const rows = Array.from({ length: 40 }, (_, index) => ({ ...base[0]!, roundNumber: Math.floor(index / 2) + 1, courtNumber: index % 2 + 1, teamA: '一'.repeat(44), teamB: '二'.repeat(44) }));
    const pages = layoutPoster([], rows);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((p) => p.height <= 880)).toBe(true);
    expect(pages.flatMap((p) => p.blocks).filter((b) => b.kind === 'match')).toHaveLength(40);
    for (const page of pages) {
      expect(page.blocks[0]?.kind).toBe('round');
      for (const block of page.blocks.filter((b) => b.kind === 'match')) expect(block.teamA!.join('')).toBe('一'.repeat(44));
    }
  });
});

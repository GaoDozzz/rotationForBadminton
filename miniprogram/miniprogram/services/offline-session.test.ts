import { beforeEach, describe, expect, it } from 'vitest';
import { Gender, MatchFormat, RegistrationMode } from '../shared/contracts';
import type { EventDraftInput } from '../shared/models';
import { beginOfflineSession, confirmOfflineWithdraw, createOfflineEvent, getOfflineEvent, listOfflineDrafts, listOfflineMatches, listOfflineRankings, resetOfflineSession, saveOfflineDraft, updateOfflineScore } from './offline-session';

function draft(format: MatchFormat = MatchFormat.Singles, count = 4): EventDraftInput {
  return {
    title: '离线测试球局', matchFormat: format, registrationMode: RegistrationMode.OrganizerManaged,
    courtCount: 1, scoreTo: 21, rounds: 10,
    manualParticipants: Array.from({ length: count }, (_, index) => ({
      localId: `local-${index}`, participantNumber: String(index + 1), nickname: `选手${index + 1}`,
      gender: index % 2 === 0 ? Gender.Male : Gender.Female,
    })),
  };
}

describe('offline session', () => {
  beforeEach(() => beginOfflineSession([]));

  it('creates a memory-only event with the configured round count and varied singles opponents', () => {
    const event = createOfflineEvent(draft()); const matches = listOfflineMatches(event.id, 'ALL');
    expect(new Set(matches.map((item) => item.roundNumber)).size).toBe(10);
    const pairs = new Set(matches.map((item) => item.players.map((player) => player.participant.id).sort().join('|')));
    expect(pairs.size).toBeGreaterThan(1);
  });

  it('calculates point-difference ranking and allows resetting a score', () => {
    const event = createOfflineEvent(draft()); const match = listOfflineMatches(event.id, 'ALL')[0]!;
    updateOfflineScore(event.id, match.id, 21, 18);
    expect(listOfflineRankings(event.id).map((item) => item.points).sort((a, b) => a - b)).toEqual([-3, 0, 0, 3]);
    expect(updateOfflineScore(event.id, match.id, 0, 0).status).toBe('SCHEDULED');
  });

  it('keeps every configured round after a participant withdraws and replans', () => {
    const event = createOfflineEvent(draft(MatchFormat.Singles, 5)); const participant = getOfflineEvent(event.id).participants![0]!;
    confirmOfflineWithdraw(event.id, participant.id);
    expect(new Set(listOfflineMatches(event.id, 'ALL').map((item) => item.roundNumber))).toEqual(new Set(Array.from({ length: 10 }, (_, index) => index + 1)));
    expect(getOfflineEvent(event.id).participants!.find((item) => item.id === participant.id)?.status).toBe('WITHDRAWN');
  });

  it('always creates one-man-one-woman teams for mixed doubles', () => {
    const event = createOfflineEvent(draft(MatchFormat.MixedDoubles));
    for (const match of listOfflineMatches(event.id, 'ALL')) {
      for (const side of ['A', 'B'] as const) expect(new Set(match.players.filter((item) => item.side === side).map((item) => item.participant.gender))).toEqual(new Set([Gender.Male, Gender.Female]));
    }
  });

  it('clears all temporary drafts when leaving the offline session', () => {
    saveOfflineDraft(draft()); expect(listOfflineDrafts()).toHaveLength(1);
    resetOfflineSession(); expect(listOfflineDrafts()).toHaveLength(0);
  });
});

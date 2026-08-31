import { describe, expect, it } from 'vitest';
import { FinishRule, MatchFormat } from '@zzjl/contracts';
import { calculateRankings } from './ranking';
import type { ConfirmedMatch } from './types';

const scoreRule = {
  scoreTo: 21 as const,
  finishRule: FinishRule.DeuceWithCap,
  scoreCap: 30,
};

describe('calculateRankings', () => {
  it('applies score difference to a singles match and keeps total points zero', () => {
    const rankings = calculateRankings(['a', 'b'], [
      singlesMatch('m1', 'a', 'b', 21, 15),
    ]);

    expect(rankings).toEqual([
      expect.objectContaining({ participantId: 'a', rank: 1, points: 6, wins: 1 }),
      expect.objectContaining({ participantId: 'b', rank: 2, points: -6, losses: 1 }),
    ]);
    expect(rankings.reduce((sum, row) => sum + row.points, 0)).toBe(0);
  });

  it('awards the same difference to both partners in doubles', () => {
    const match: ConfirmedMatch = {
      id: 'm1',
      format: MatchFormat.Doubles,
      teamAPlayerIds: ['a', 'b'],
      teamBPlayerIds: ['c', 'd'],
      teamAScore: 22,
      teamBScore: 20,
      scoreRule,
    };
    const rankings = calculateRankings(['a', 'b', 'c', 'd'], [match]);

    expect(rankings.filter((entry) => entry.points === 2)).toHaveLength(2);
    expect(rankings.filter((entry) => entry.points === -2)).toHaveLength(2);
    expect(rankings.reduce((sum, row) => sum + row.points, 0)).toBe(0);
  });

  it('uses competition ranking for fully tied players', () => {
    const rankings = calculateRankings(['a', 'b', 'c'], []);
    expect(rankings.map((entry) => entry.rank)).toEqual([1, 1, 1]);
  });

  it('recomputes from the supplied matches instead of retaining an old score', () => {
    const original = calculateRankings(['a', 'b'], [singlesMatch('m1', 'a', 'b', 21, 15)]);
    const corrected = calculateRankings(['a', 'b'], [singlesMatch('m1', 'a', 'b', 15, 21)]);

    expect(original[0]?.participantId).toBe('a');
    expect(corrected[0]?.participantId).toBe('b');
  });
});

function singlesMatch(
  id: string,
  playerA: string,
  playerB: string,
  teamAScore: number,
  teamBScore: number,
): ConfirmedMatch {
  return {
    id,
    format: MatchFormat.Singles,
    teamAPlayerIds: [playerA],
    teamBPlayerIds: [playerB],
    teamAScore,
    teamBScore,
    scoreRule,
  };
}

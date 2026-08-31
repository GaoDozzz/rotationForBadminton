import { describe, expect, it } from 'vitest';
import { MatchFormat } from '@zzjl/contracts';
import { generateFreeRotation, recommendRotationRounds } from './rotation';

describe('generateFreeRotation', () => {
  it('defaults playable events to ten rounds and accepts twenty rounds', () => {
    expect(recommendRotationRounds(2)).toBe(10);
    expect(generateFreeRotation({ participantIds: ['1', '2'], format: MatchFormat.Singles, courtCount: 1, rounds: 20 }).rounds).toBe(20);
  });

  it('generates singles without duplicate players in a round', () => {
    const schedule = generateFreeRotation({ participantIds: ['1', '2', '3', '4', '5'], format: MatchFormat.Singles, courtCount: 2, rounds: 4 });
    expect(schedule.matches).toHaveLength(8);
    for (let round = 1; round <= 4; round += 1) {
      const ids = schedule.matches.filter((match) => match.roundNumber === round).flatMap((match) => [...match.teamAPlayerIds, ...match.teamBPlayerIds]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('rotates all six opponent pairs before repeating in four-player singles', () => {
    const schedule = generateFreeRotation({ participantIds: ['A', 'B', 'C', 'D'], format: MatchFormat.Singles, courtCount: 2, rounds: 3 });
    const pairs = schedule.matches.map((match) => pair([...match.teamAPlayerIds, ...match.teamBPlayerIds]));
    expect(new Set(pairs).size).toBe(6);
  });

  it('keeps four-player one-court singles balanced and limits feasible streaks to two', () => {
    const ids = ['A', 'B', 'C', 'D'];
    const schedule = generateFreeRotation({ participantIds: ids, format: MatchFormat.Singles, courtCount: 1, rounds: 10 });
    const counts = playCounts(ids, schedule.matches);
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
    for (const id of ids) {
      let streak = 0;
      for (let round = 1; round <= 10; round += 1) {
        const plays = schedule.matches.some((match) => match.roundNumber === round && [...match.teamAPlayerIds, ...match.teamBPlayerIds].includes(id));
        streak = plays ? streak + 1 : 0;
        expect(streak).toBeLessThanOrEqual(2);
      }
    }
  });

  it('keeps doubles play counts balanced', () => {
    const ids = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const schedule = generateFreeRotation({ participantIds: ids, format: MatchFormat.Doubles, courtCount: 2, rounds: 8 });
    const counts = playCounts(ids, schedule.matches);
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
  });

  it('avoids a third consecutive appearance when enough substitutes exist', () => {
    const ids = ['1', '2', '3', '4', '5', '6'];
    const schedule = generateFreeRotation({ participantIds: ids, format: MatchFormat.Doubles, courtCount: 1, rounds: 10 });
    for (const id of ids) {
      let streak = 0;
      for (let round = 1; round <= 10; round += 1) {
        const plays = schedule.matches.some((match) => match.roundNumber === round && [...match.teamAPlayerIds, ...match.teamBPlayerIds].includes(id));
        streak = plays ? streak + 1 : 0;
        expect(streak).toBeLessThanOrEqual(2);
      }
    }
  });

  it('canonicalizes team and side order when avoiding duplicate doubles matchups', () => {
    const schedule = generateFreeRotation({ participantIds: ['1', '2', '3', '4', '5', '6', '7', '8'], format: MatchFormat.Doubles, courtCount: 2, rounds: 10 });
    const signatures = schedule.matches.map(matchupSignature);
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('maximizes different partners before reusing combinations', () => {
    const ids = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const schedule = generateFreeRotation({ participantIds: ids, format: MatchFormat.Doubles, courtCount: 2, rounds: 7 });
    const partners = new Set(schedule.matches.flatMap((match) => [pair(match.teamAPlayerIds), pair(match.teamBPlayerIds)]));
    expect(partners.size).toBeGreaterThanOrEqual(24);
  });

  it('can generate exactly the remaining rounds after locked history', () => {
    const schedule = generateFreeRotation({ participantIds: ['1', '2', '3', '4'], format: MatchFormat.Doubles, courtCount: 1, rounds: 7, startRound: 4, history: [{ roundNumber: 3, teamAPlayerIds: ['1', '2'], teamBPlayerIds: ['3', '4'] }] });
    expect(schedule.matches).toHaveLength(7);
    expect(schedule.matches[0]?.roundNumber).toBe(4);
    expect(schedule.matches.at(-1)?.roundNumber).toBe(10);
  });
});

function playCounts(ids: readonly string[], matches: readonly { teamAPlayerIds: string[]; teamBPlayerIds: string[] }[]): Map<string, number> {
  const counts = new Map(ids.map((id) => [id, 0]));
  for (const match of matches) for (const id of [...match.teamAPlayerIds, ...match.teamBPlayerIds]) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}
function pair(ids: readonly string[]): string { return [...ids].sort().join('/'); }
function matchupSignature(match: { teamAPlayerIds: string[]; teamBPlayerIds: string[] }): string { return [pair(match.teamAPlayerIds), pair(match.teamBPlayerIds)].sort().join('|'); }

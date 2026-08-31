import { describe, expect, it } from 'vitest';
import { MatchFormat } from '@zzjl/contracts';
import { generateBalancedFreeRotation } from './balanced-rotation';

describe('generateBalancedFreeRotation', () => {
  it('uses every opponent pair in four-player one-court singles before heavy repetition', () => {
    const schedule = generateBalancedFreeRotation({ participantIds: ['A', 'B', 'C', 'D'], format: MatchFormat.Singles, courtCount: 1, rounds: 10 });
    const pairs = schedule.matches.map((match) => [...match.teamAPlayerIds, ...match.teamBPlayerIds].sort().join('/'));
    expect(new Set(pairs).size).toBe(6);
  });

  it('keeps play counts balanced and avoids a third consecutive match when feasible', () => {
    const ids = ['A', 'B', 'C', 'D'];
    const schedule = generateBalancedFreeRotation({ participantIds: ids, format: MatchFormat.Singles, courtCount: 1, rounds: 10 });
    const counts = new Map(ids.map((id) => [id, 0]));
    for (const match of schedule.matches) for (const id of [...match.teamAPlayerIds, ...match.teamBPlayerIds]) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
    for (const id of ids) {
      let streak = 0;
      for (let round = 1; round <= 10; round += 1) {
        const plays = schedule.matches.some((match) => match.roundNumber === round && [...match.teamAPlayerIds, ...match.teamBPlayerIds].includes(id));
        streak = plays ? streak + 1 : 0; expect(streak).toBeLessThanOrEqual(2);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { MatchFormat } from '@zzjl/contracts';
import { generateMixedDoublesRotation } from './mixed-rotation';

const ids = ['M1', 'M2', 'M3', 'M4', 'F1', 'F2', 'F3', 'F4'];
const genders = Object.fromEntries(ids.map((id) => [id, id.startsWith('M') ? 'MALE' : 'FEMALE'])) as Record<string, 'MALE' | 'FEMALE'>;

describe('generateMixedDoublesRotation', () => {
  it('keeps every team mixed in every round', () => {
    const schedule = generateMixedDoublesRotation({ participantIds: ids, participantGenders: genders, format: MatchFormat.MixedDoubles, courtCount: 2, rounds: 10 });
    expect(schedule.matches).toHaveLength(20);
    for (const match of schedule.matches) for (const team of [match.teamAPlayerIds, match.teamBPlayerIds]) {
      expect(team.map((id) => genders[id]).sort()).toEqual(['FEMALE', 'MALE']);
    }
  });

  it('uses different mixed partners before excessive repetition', () => {
    const schedule = generateMixedDoublesRotation({ participantIds: ids, participantGenders: genders, format: MatchFormat.MixedDoubles, courtCount: 1, rounds: 10 });
    const partners = new Set(schedule.matches.flatMap((match) => [match.teamAPlayerIds.slice().sort().join('/'), match.teamBPlayerIds.slice().sort().join('/')]));
    expect(partners.size).toBeGreaterThanOrEqual(12);
  });


  it('balances appearances and avoids a third consecutive round when substitutes exist', () => {
    const schedule = generateMixedDoublesRotation({ participantIds: ids, participantGenders: genders, format: MatchFormat.MixedDoubles, courtCount: 1, rounds: 10 });
    const counts = new Map(ids.map((id) => [id, 0]));
    for (const match of schedule.matches) for (const id of [...match.teamAPlayerIds, ...match.teamBPlayerIds]) counts.set(id, (counts.get(id) ?? 0) + 1);
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
});

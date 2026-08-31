import { describe, expect, it } from 'vitest';
import { FinishRule } from '@zzjl/contracts';
import { validateFinalScore } from './scoring';

describe('validateFinalScore', () => {
  const deuce21 = {
    scoreTo: 21 as const,
    finishRule: FinishRule.DeuceWithCap,
    scoreCap: 30,
  };

  it.each([
    [21, 19],
    [22, 20],
    [30, 28],
    [30, 29],
  ])('accepts a legal deuce score %i:%i', (a, b) => {
    expect(validateFinalScore(a, b, deuce21).valid).toBe(true);
  });

  it.each([
    [21, 20],
    [22, 21],
    [30, 27],
    [31, 29],
  ])('rejects an impossible deuce score %i:%i', (a, b) => {
    expect(validateFinalScore(a, b, deuce21).valid).toBe(false);
  });

  it('supports first-to 11', () => {
    const result = validateFinalScore(7, 11, {
      scoreTo: 11,
      finishRule: FinishRule.FirstTo,
    });
    expect(result).toEqual({ valid: true, winner: 'B', pointDifference: 4 });
  });
});


import { describe, expect, it } from 'vitest';
import { Gender } from '@zzjl/contracts';
import { validateManualRoster } from './manual-registration';

describe('validateManualRoster', () => {
  it('normalizes organizer-entered number and nickname', () => {
    const result = validateManualRoster([{ participantNumber: '  A-01 ', nickname: ' 小明 ', gender: Gender.Male }]);
    expect(result.valid).toBe(true);
    expect(result.normalized[0]).toEqual({ participantNumber: 'A-01', nickname: '小明', gender: Gender.Male, level: undefined });
  });
  it('rejects case-insensitive duplicated numbers', () => {
    const result = validateManualRoster([{ participantNumber: 'A01', nickname: '甲', gender: Gender.Male }, { participantNumber: 'a01', nickname: '乙', gender: Gender.Female }]);
    expect(result.issues).toContainEqual(expect.objectContaining({ index: 1, code: 'NUMBER_DUPLICATED' }));
  });
  it('rejects trimmed and case-insensitive duplicated nicknames', () => {
    const result = validateManualRoster([{ participantNumber: '1', nickname: ' Player ', gender: Gender.Male }, { participantNumber: '2', nickname: 'player', gender: Gender.Female }]);
    expect(result.issues).toContainEqual(expect.objectContaining({ index: 1, code: 'NICKNAME_DUPLICATED' }));
  });
  it('requires nickname and gender-compatible values', () => {
    const result = validateManualRoster([{ participantNumber: '1', nickname: ' ', gender: 'UNKNOWN' as Gender }]);
    expect(result.issues.map((item) => item.code)).toEqual(expect.arrayContaining(['NICKNAME_LENGTH_INVALID', 'GENDER_REQUIRED']));
  });
});

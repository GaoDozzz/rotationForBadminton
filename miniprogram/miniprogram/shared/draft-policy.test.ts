import { describe, expect, it } from 'vitest';
import { canSaveDraft } from './draft-policy';

describe('canSaveDraft', () => {
  it('allows at most three new drafts', () => {
    expect(canSaveDraft([])).toBe(true);
    expect(canSaveDraft(['1', '2'])).toBe(true);
    expect(canSaveDraft(['1', '2', '3'])).toBe(false);
  });

  it('allows updating an existing draft when the limit is reached', () => {
    expect(canSaveDraft(['1', '2', '3'], '2')).toBe(true);
  });
});


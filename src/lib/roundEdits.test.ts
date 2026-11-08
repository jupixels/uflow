import { describe, expect, it } from 'vitest';
import type { BankResponse } from '../types';
import { applyEdit, nextEdit, retagText } from './roundEdits';

const base: BankResponse = {
  id: 'r1',
  argumentId: 'a',
  kind: 'NU',
  isCard: false,
  tag: 'Jobs already declining',
  text: 'Bank explanation',
  strength: 2,
  timesUsed: 0,
  createdAt: 0,
};

describe('round edits', () => {
  it('overlays round changes on the bank version', () => {
    expect(applyEdit(base, undefined)).toBe(base);
    const edited = applyEdit(base, { id: 'x', roundId: 'R', responseId: 'r1', text: 'Tailored', updatedAt: 0 });
    expect(edited).toMatchObject({ tag: 'Jobs already declining', text: 'Tailored' });
  });

  it('keeps only what differs from the bank, and clears when nothing does', () => {
    const e = nextEdit(base, undefined, 'R', { text: 'Tailored' }, 5)!;
    expect(e).toEqual({ id: 'R:r1', roundId: 'R', responseId: 'r1', text: 'Tailored', updatedAt: 5 });
    const both = nextEdit(base, e, 'R', { tag: '  Jobs declining in Ohio ' }, 6)!;
    expect(both).toMatchObject({ tag: 'Jobs declining in Ohio', text: 'Tailored' });
    expect(nextEdit(base, both, 'R', { tag: 'Jobs already declining', text: 'Bank explanation' }, 7)).toBeNull();
  });

  it('ignores a blank tag', () => {
    expect(nextEdit(base, undefined, 'R', { tag: '   ' }, 1)).toBeNull();
  });

  it('retags only the lines that hold the old tag', () => {
    const text = 'note\n[NU] Jobs already declining (Smith 23)\nother';
    expect(retagText(text, 'Jobs already declining', 'Jobs declining in Ohio')).toBe('note\n[NU] Jobs declining in Ohio (Smith 23)\nother');
    expect(retagText(text, 'Missing', 'X')).toBe(text);
  });
});

import { describe, expect, it } from 'vitest';
import type { BankResponse } from '../types';
import { lineHasResponse, responseAtCaret, responsesInCell } from './explain';

const resp = (id: string, tag: string): BankResponse => ({
  id,
  argumentId: 'a',
  kind: 'NU',
  isCard: false,
  tag,
  text: `${tag} explained`,
  strength: 2,
  timesUsed: 0,
  createdAt: 0,
});
const nu = resp('nu', 'Plastics jobs already declining from automation');
const lt = resp('lt', 'Alternatives create more jobs');
const wgh = resp('wgh', 'Prefer scope');
const byId = new Map([nu, lt, wgh].map((r) => [r.id, r]));

describe('explain matching', () => {
  const text = 'my own note\n[LT] Alternatives create more jobs\n[NU] Plastics jobs already declining from automation (Example 23)';

  it('lists inserted responses still in the cell, in text order', () => {
    expect(responsesInCell(text, ['nu', 'lt', 'wgh'], byId).map((r) => r.id)).toEqual(['lt', 'nu']);
  });

  it('drops responses whose line was deleted, and unknown ids', () => {
    expect(responsesInCell('my own note', ['nu', 'gone'], byId)).toEqual([]);
  });

  it('still recognises a long tag after a small edit to its end', () => {
    expect(lineHasResponse('[NU] Plastics jobs already declining, mostly', nu)).toBe(true);
    expect(lineHasResponse('[NU] Plastics are bad', nu)).toBe(false);
  });

  it('finds the response on the caret line', () => {
    const present = responsesInCell(text, ['nu', 'lt'], byId);
    expect(responseAtCaret(text, text.indexOf('Alternatives') + 3, present)?.id).toBe('lt');
    expect(responseAtCaret(text, text.length, present)?.id).toBe('nu');
    expect(responseAtCaret(text, 2, present)).toBeUndefined();
  });
});

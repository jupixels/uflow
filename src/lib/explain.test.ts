import { describe, expect, it } from 'vitest';
import type { BankResponse } from '../types';
import type { FlowCell } from '../types';
import { cellKinds, lineHasResponse, responseAtCaret, responsesInCell, withoutCopiedKind } from './explain';

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

describe('cell badges', () => {
  const ltResp = { ...lt, kind: 'LINK_TURN' as const };

  it('shows your own tag first, then the types of responses still in the cell', () => {
    expect(cellKinds(undefined, [])).toEqual([]);
    expect(cellKinds(undefined, [nu, ltResp])).toEqual(['NU', 'LINK_TURN']);
    expect(cellKinds('WEIGHING', [nu, { ...nu, id: 'nu2' }])).toEqual(['WEIGHING', 'NU']);
  });

  it('clears a stored tag that was copied from an inserted response', () => {
    const cell: FlowCell = { id: 'c', roundId: 'r', rowId: 'w', speech: 'PR', text: '', kind: 'NU', linkedResponseIds: ['nu'] };
    const kindOf = (id: string) => byId.get(id)?.kind;
    expect(withoutCopiedKind(cell, kindOf).kind).toBeUndefined();
    // A tag that doesn't match any inserted response was set by hand: keep it.
    expect(withoutCopiedKind({ ...cell, kind: 'WEIGHING' }, kindOf).kind).toBe('WEIGHING');
    expect(withoutCopiedKind({ ...cell, linkedResponseIds: [] }, kindOf).kind).toBe('NU');
  });
});

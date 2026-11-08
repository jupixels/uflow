import type { BankResponse, RoundEdit } from '../types';

export const roundEditId = (roundId: string, responseId: string) => `${roundId}:${responseId}`;

/** The response as it reads in this round: the bank version with any round-only changes on top. */
export function applyEdit(r: BankResponse, edit: RoundEdit | undefined): BankResponse {
  if (!edit) return r;
  return { ...r, tag: edit.tag ?? r.tag, text: edit.text ?? r.text };
}

/** Swap an old tag for a new one on every line of a cell that contains it. */
export function retagText(text: string, oldTag: string, newTag: string): string {
  if (!oldTag || oldTag === newTag) return text;
  return text
    .split('\n')
    .map((line) => (line.includes(oldTag) ? line.replace(oldTag, newTag) : line))
    .join('\n');
}

/**
 * The stored edit after a change, or null when nothing differs from the bank
 * any more. A blank tag is ignored: a response always needs one.
 */
export function nextEdit(
  base: BankResponse,
  prev: RoundEdit | undefined,
  roundId: string,
  patch: { tag?: string; text?: string },
  now: number,
): RoundEdit | null {
  const tag = patch.tag !== undefined && patch.tag.trim() ? patch.tag.trim() : prev?.tag;
  const text = patch.text !== undefined ? patch.text : prev?.text;
  const edit: RoundEdit = { id: roundEditId(roundId, base.id), roundId, responseId: base.id, updatedAt: now };
  if (tag !== undefined && tag !== base.tag) edit.tag = tag;
  if (text !== undefined && text !== base.text) edit.text = text;
  return edit.tag === undefined && edit.text === undefined ? null : edit;
}

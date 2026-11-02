import type { BankResponse } from '../types';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** Enough of a tag to still recognise a line after small edits at the end of it. */
const PREFIX = 24;

/** Whether a flow line still holds an inserted response: its tag, or the start of a long tag. */
export function lineHasResponse(line: string, r: BankResponse): boolean {
  const l = norm(line);
  const t = norm(r.tag);
  if (!t || !l) return false;
  return l.includes(t) || (t.length > PREFIX && l.includes(t.slice(0, PREFIX)));
}

/**
 * Bank responses inserted into a cell that are still in its text, in the
 * order they appear. A response whose line was deleted no longer counts.
 */
export function responsesInCell(text: string, linkedIds: string[], byId: Map<string, BankResponse>): BankResponse[] {
  const lines = text.split('\n');
  return linkedIds
    .map((id) => byId.get(id))
    .filter((r): r is BankResponse => !!r)
    .map((r) => ({ r, at: lines.findIndex((l) => lineHasResponse(l, r)) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.r);
}

/** The response on the line the caret is in, if any. */
export function responseAtCaret(text: string, caret: number, present: BankResponse[]): BankResponse | undefined {
  const start = text.lastIndexOf('\n', caret - 1) + 1;
  const end = text.indexOf('\n', caret);
  const line = text.slice(start, end === -1 ? undefined : end);
  return present.find((r) => lineHasResponse(line, r));
}

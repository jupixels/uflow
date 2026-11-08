import type { BankResponse, FlowCell, ResponseKind } from '../types';

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
export function responsesInCell(
  text: string,
  linkedIds: string[],
  byId: Map<string, BankResponse>,
  /** Other wording to accept, e.g. the bank version while a round-only tag change is saving. */
  alsoById?: Map<string, BankResponse>,
): BankResponse[] {
  const lines = text.split('\n');
  const matches = (l: string, r: BankResponse) => {
    const alt = alsoById?.get(r.id);
    return lineHasResponse(l, r) || (!!alt && lineHasResponse(l, alt));
  };
  return linkedIds
    .map((id) => byId.get(id))
    .filter((r): r is BankResponse => !!r)
    .map((r) => ({ r, at: lines.findIndex((l) => matches(l, r)) }))
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

/**
 * Type badges for a cell: the tag you set yourself (Alt+1–6) first, then the
 * types of the bank responses still in it, without repeats. Inserted
 * responses never set the cell's own tag, so their badges come and go with them.
 */
export function cellKinds(manual: ResponseKind | undefined, present: BankResponse[]): ResponseKind[] {
  const kinds = manual ? [manual] : [];
  for (const r of present) if (!kinds.includes(r.kind)) kinds.push(r.kind);
  return kinds;
}

/**
 * Before this fix, inserting a response copied its type onto the cell for good.
 * A stored tag that matches one of the cell's inserted responses was almost
 * certainly copied that way, so it is cleared; badges now come from the responses.
 */
export function withoutCopiedKind(cell: FlowCell, kindOf: (responseId: string) => ResponseKind | undefined): FlowCell {
  if (!cell.kind || !cell.linkedResponseIds?.some((id) => kindOf(id) === cell.kind)) return cell;
  const rest = { ...cell };
  delete rest.kind;
  return rest;
}

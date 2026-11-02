import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import {
  createArgument,
  createResolution,
  createRound,
  deleteResolution,
  deleteRound,
  insertRow,
  recordInsert,
  saveResponse,
  toggleKind,
  updateCell,
} from './repo';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const roundDraft = (resolutionId: string) => ({
  resolutionId,
  tournament: 'TOC',
  roundName: 'R1',
  ourSide: 'PRO' as const,
  speakingOrder: 2 as const,
  opponents: 'X',
  judge: 'J',
  judgeType: 'FLOW' as const,
  prepSeconds: 180,
});

describe('repo', () => {
  it('deleting a resolution removes its arguments and responses', async () => {
    const res = await createResolution('Res');
    const a = await createArgument(res.id, 'CON', 'Arg');
    await saveResponse({ argumentId: a.id, kind: 'NU', isCard: false, tag: 'NU', text: '', strength: 2 });
    await deleteResolution(res.id);
    expect(await db.args.count()).toBe(0);
    expect(await db.responses.count()).toBe(0);
  });

  it('creates a round with one row per sheet and inserts rows in order', async () => {
    const res = await createResolution('Res');
    const round = await createRound(roundDraft(res.id));
    const first = (await db.rows.where({ roundId: round.id, sheet: 'CON' }).toArray())[0];
    expect(first.order).toBe(0);
    const end = await insertRow(round.id, 'CON');
    const middle = await insertRow(round.id, 'CON', 0);
    const ordered = (await db.rows.where({ roundId: round.id, sheet: 'CON' }).sortBy('order')).map((r) => r.id);
    expect(ordered).toEqual([first.id, middle.id, end.id]);
  });

  it('records quick inserts and keeps one cell per row/speech', async () => {
    const res = await createResolution('Res');
    const a = await createArgument(res.id, 'CON', 'Arg');
    const r = await saveResponse({ argumentId: a.id, kind: 'DELINK', isCard: false, tag: 'Delink', text: '', strength: 2 });
    const round = await createRound(roundDraft(res.id));
    const row = await insertRow(round.id, 'CON');
    await updateCell(round.id, row.id, 'PR', { text: 'hello' });
    await recordInsert(round.id, row.id, 'PR', r);
    const cells = await db.cells.where('rowId').equals(row.id).toArray();
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ text: 'hello', linkedResponseIds: [r.id] });
    // The response's type is shown as a badge, not stored as the cell's own tag.
    expect(cells[0].kind).toBeUndefined();
    expect((await db.responses.get(r.id))?.timesUsed).toBe(1);

    await deleteRound(round.id);
    expect(await db.cells.count()).toBe(0);
    expect(await db.rows.count()).toBe(0);
  });

  it('toggles kinds', () => {
    expect(toggleKind(undefined, 'NU')).toBe('NU');
    expect(toggleKind('NU', 'NU')).toBeUndefined();
    expect(toggleKind('NU', 'WEIGHING')).toBe('WEIGHING');
  });
});

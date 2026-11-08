import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { exportAll, exportBank, importAll, parseExport } from './data';
import {
  createArgument,
  createResolution,
  createRound,
  deleteResponse,
  deleteRound,
  insertRow,
  recordInsert,
  resetRoundEdit,
  saveResponse,
  setRoundEdit,
  updateCell,
} from './repo';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seed() {
  const res = await createResolution('Res');
  const a = await createArgument(res.id, 'CON', 'Arg');
  const r = await saveResponse({ argumentId: a.id, kind: 'NU', isCard: false, tag: 'Jobs already declining', text: 'Bank text', strength: 2 });
  const round = await createRound({
    resolutionId: res.id,
    tournament: '',
    roundName: '',
    ourSide: 'PRO',
    speakingOrder: 1,
    opponents: '',
    judge: '',
    judgeType: 'FLOW',
    prepSeconds: 180,
  });
  const row = await insertRow(round.id, 'CON');
  await updateCell(round.id, row.id, 'PR', { text: 'note\n[NU] Jobs already declining' });
  await recordInsert(round.id, row.id, 'PR', r);
  return { r, round, row };
}

const cellText = async (rowId: string) => (await db.cells.where({ rowId, speech: 'PR' }).first())!.text;

describe('round edits in the database', () => {
  it('changes the round only: the bank is untouched and the flow line follows the new tag', async () => {
    const { r, round, row } = await seed();
    await setRoundEdit(round.id, r.id, { tag: 'Jobs declining in Ohio', text: 'Tailored' });
    expect((await db.responses.get(r.id))?.tag).toBe('Jobs already declining');
    expect(await cellText(row.id)).toBe('note\n[NU] Jobs declining in Ohio');
    expect(await db.roundEdits.get(`${round.id}:${r.id}`)).toMatchObject({ tag: 'Jobs declining in Ohio', text: 'Tailored' });
  });

  it('resets to the bank version, including the flow line', async () => {
    const { r, round, row } = await seed();
    await setRoundEdit(round.id, r.id, { tag: 'Jobs declining in Ohio', text: 'Tailored' });
    await resetRoundEdit(round.id, r.id);
    expect(await db.roundEdits.count()).toBe(0);
    expect(await cellText(row.id)).toBe('note\n[NU] Jobs already declining');
  });

  it('goes away with its round or its response', async () => {
    const { r, round } = await seed();
    await setRoundEdit(round.id, r.id, { text: 'Tailored' });
    await deleteRound(round.id);
    expect(await db.roundEdits.count()).toBe(0);

    const again = await seed();
    await setRoundEdit(again.round.id, again.r.id, { text: 'Tailored' });
    await deleteResponse(again.r.id);
    expect(await db.roundEdits.count()).toBe(0);
  });

  it('is in full backups but not in a shared bank, and older backups still import', async () => {
    const { r, round } = await seed();
    await setRoundEdit(round.id, r.id, { text: 'Tailored' });
    expect((await exportAll()).roundEdits).toHaveLength(1);
    expect((await exportBank()).roundEdits).toHaveLength(0);
    const old = { ...(await exportAll()), version: 5 } as Record<string, unknown>;
    delete old.roundEdits;
    await Promise.all(db.tables.map((t) => t.clear()));
    expect((await importAll(parseExport(JSON.stringify(old)))).counts.roundEdits).toBe(0);
  });
});

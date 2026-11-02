import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { exportAll, exportBank, importAll, parseExport } from './data';
import { createArgument, createResolution, createRound, saveResponse } from './repo';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seed() {
  const res = await createResolution('Res');
  const a = await createArgument(res.id, 'CON', 'Arg');
  await saveResponse({ argumentId: a.id, kind: 'NU', isCard: true, tag: 'Tag', cite: 'Smith 22', text: 'x', strength: 3 });
  await createRound({
    resolutionId: res.id,
    tournament: 't',
    roundName: 'r',
    ourSide: 'PRO',
    speakingOrder: 1,
    opponents: '',
    judge: '',
    judgeType: 'LAY',
    prepSeconds: 120,
  });
  return res;
}

describe('export / import', () => {
  it('round-trips everything and merges without duplicates', async () => {
    await seed();
    const json = JSON.stringify(await exportAll());
    await Promise.all(db.tables.map((t) => t.clear()));

    const file = parseExport(json);
    const result = await importAll(file);
    expect(result.counts).toMatchObject({ resolutions: 1, args: 1, responses: 1, rounds: 1, rows: 2 });
    await importAll(file);
    expect(await db.responses.count()).toBe(1);
    expect(await db.rows.count()).toBe(2);
  });

  it('bank export leaves rounds out', async () => {
    const res = await seed();
    const bank = await exportBank(res.id);
    expect(bank.responses).toHaveLength(1);
    expect(bank.rounds).toHaveLength(0);
  });

  it('rejects files that are not exports', () => {
    expect(() => parseExport('nope')).toThrow(/valid JSON/);
    expect(() => parseExport('{"foo":1}')).toThrow(/not a U Flow export/);
    expect(() => parseExport('{"app":"rebuttal-flow","version":99}')).toThrow(/newer version/);
    expect(() => parseExport('{"app":"rebuttal-flow","version":1,"responses":[{}]}')).toThrow(/malformed/);
  });
});

describe('importing older backups', () => {
  it('clears cell tags copied from inserted responses in pre-v5 backups only', async () => {
    const res = await createResolution('Res');
    const a = await createArgument(res.id, 'CON', 'Arg');
    const r = await saveResponse({ argumentId: a.id, kind: 'NU', isCard: false, tag: 'T', text: '', strength: 2 });
    const file = await exportAll();
    const cell = { id: 'c1', roundId: 'x', rowId: 'w', speech: 'PR' as const, text: '[NU] T', kind: 'NU' as const, linkedResponseIds: [r.id] };
    const manual = { ...cell, id: 'c2', kind: 'WEIGHING' as const };
    await Promise.all(db.tables.map((t) => t.clear()));
    await importAll({ ...file, version: 4, cells: [cell, manual] });
    expect((await db.cells.get('c1'))?.kind).toBeUndefined();
    expect((await db.cells.get('c2'))?.kind).toBe('WEIGHING');
    await importAll({ ...file, cells: [cell] });
    expect((await db.cells.get('c1'))?.kind).toBe('NU');
  });
});

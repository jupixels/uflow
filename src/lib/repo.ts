import { db, newId } from '../db';
import { type Grade, rate } from './flashcards';
import type {
  Argument,
  BankResponse,
  Case,
  CaseSection,
  CxEntry,
  CxQuestion,
  FlowCell,
  FlowRow,
  Resolution,
  ResponseKind,
  Review,
  Round,
  Side,
  Speech,
} from '../types';

// ---- Bank ----

export async function createResolution(title: string, monthRange?: string): Promise<Resolution> {
  const r: Resolution = { id: newId(), title: title.trim(), monthRange, createdAt: Date.now() };
  await db.resolutions.add(r);
  return r;
}

export async function deleteResolution(id: string) {
  await db.transaction('rw', [db.resolutions, db.args, db.responses, db.questions, db.reviews], async () => {
    const argIds = (await db.args.where('resolutionId').equals(id).toArray()).map((a) => a.id);
    await db.reviews.bulkDelete(await db.responses.where('argumentId').anyOf(argIds).primaryKeys());
    await db.responses.where('argumentId').anyOf(argIds).delete();
    await db.questions.where('argumentId').anyOf(argIds).delete();
    await db.args.bulkDelete(argIds);
    await db.resolutions.delete(id);
  });
}

export async function createArgument(resolutionId: string, side: Side, title: string): Promise<Argument> {
  const a: Argument = { id: newId(), resolutionId, side, title: title.trim(), createdAt: Date.now() };
  await db.args.add(a);
  return a;
}

export async function deleteArgument(id: string) {
  await db.transaction('rw', [db.args, db.responses, db.questions, db.rows, db.reviews], async () => {
    await db.reviews.bulkDelete(await db.responses.where('argumentId').equals(id).primaryKeys());
    await db.responses.where('argumentId').equals(id).delete();
    await db.questions.where('argumentId').equals(id).delete();
    await db.args.delete(id);
    // Unlink flow rows that pointed at this argument.
    await db.rows.filter((r) => r.argumentId === id).modify({ argumentId: undefined });
  });
}

export type ResponseDraft = Omit<BankResponse, 'id' | 'createdAt' | 'timesUsed'> &
  Partial<Pick<BankResponse, 'id' | 'createdAt' | 'timesUsed'>>;

export async function saveResponse(draft: ResponseDraft): Promise<BankResponse> {
  const r: BankResponse = {
    timesUsed: 0,
    createdAt: Date.now(),
    ...draft,
    id: draft.id ?? newId(),
    tag: draft.tag.trim(),
  };
  await db.responses.put(r);
  return r;
}

export async function deleteResponse(id: string) {
  await db.transaction('rw', [db.responses, db.reviews], async () => {
    await db.responses.delete(id);
    await db.reviews.delete(id);
  });
}

// ---- Rounds & flow ----

export type RoundDraft = Omit<Round, 'id' | 'createdAt'>;

export async function createRound(draft: RoundDraft): Promise<Round> {
  const round: Round = { ...draft, id: newId(), createdAt: Date.now() };
  await db.transaction('rw', [db.rounds, db.rows], async () => {
    await db.rounds.add(round);
    // Start each sheet with one empty row so you can type right away.
    await db.rows.bulkAdd([
      { id: newId(), roundId: round.id, sheet: 'PRO', order: 0 },
      { id: newId(), roundId: round.id, sheet: 'CON', order: 0 },
    ]);
  });
  await seedOurCaseRows(round);
  return round;
}

export async function deleteRound(id: string) {
  await db.transaction('rw', [db.rounds, db.rows, db.cells, db.cx], async () => {
    await db.cells.where('roundId').equals(id).delete();
    await db.cx.where('roundId').equals(id).delete();
    await db.rows.where('roundId').equals(id).delete();
    await db.rounds.delete(id);
  });
}

/** Insert a row right after `afterOrder` (or at the end), shifting later rows down. */
export async function insertRow(roundId: string, sheet: Side, afterOrder?: number): Promise<FlowRow> {
  return db.transaction('rw', db.rows, async () => {
    const rows = await db.rows.where({ roundId, sheet }).toArray();
    const order = afterOrder === undefined ? rows.reduce((m, r) => Math.max(m, r.order + 1), 0) : afterOrder + 1;
    for (const r of rows) {
      if (r.order >= order) await db.rows.update(r.id, { order: r.order + 1 });
    }
    const row: FlowRow = { id: newId(), roundId, sheet, order };
    await db.rows.add(row);
    return row;
  });
}

export async function deleteRow(rowId: string) {
  await db.transaction('rw', [db.rows, db.cells], async () => {
    await db.cells.where('rowId').equals(rowId).delete();
    await db.rows.delete(rowId);
  });
}

export const linkRowArgument = (rowId: string, argumentId: string | undefined) =>
  db.rows.update(rowId, { argumentId });

export async function getOrCreateCell(roundId: string, rowId: string, speech: Speech): Promise<FlowCell> {
  const existing = await db.cells.where({ rowId, speech }).first();
  if (existing) return existing;
  const cell: FlowCell = { id: newId(), roundId, rowId, speech, text: '', linkedResponseIds: [] };
  await db.cells.add(cell);
  return cell;
}

export async function updateCell(
  roundId: string,
  rowId: string,
  speech: Speech,
  patch: Partial<Pick<FlowCell, 'text' | 'kind' | 'linkedResponseIds'>>,
) {
  await db.transaction('rw', db.cells, async () => {
    const cell = await getOrCreateCell(roundId, rowId, speech);
    await db.cells.update(cell.id, patch);
  });
}

export const formatInsert = (r: BankResponse, kindLabel: string) =>
  `[${kindLabel}] ${r.tag}${r.isCard && r.cite ? ` (${r.cite.split(',')[0].trim()})` : ''}`;

/** Record a quick-insert: bump the response's use count and link it to the cell. */
export async function recordInsert(roundId: string, rowId: string, speech: Speech, response: BankResponse) {
  await db.transaction('rw', [db.cells, db.responses], async () => {
    const cell = await getOrCreateCell(roundId, rowId, speech);
    const ids = cell.linkedResponseIds.includes(response.id)
      ? cell.linkedResponseIds
      : [...cell.linkedResponseIds, response.id];
    // The response's type shows as a badge while it's in the cell; it doesn't become the cell's own tag.
    await db.cells.update(cell.id, { linkedResponseIds: ids });
    await db.responses.update(response.id, { timesUsed: response.timesUsed + 1 });
  });
}

export const toggleKind = (current: ResponseKind | undefined, next: ResponseKind) =>
  current === next ? undefined : next;

export const renameArgument = (id: string, title: string) => db.args.update(id, { title: title.trim() });

// ---- Crossfire ----

export async function createQuestion(argumentId: string, text: string): Promise<CxQuestion> {
  const q: CxQuestion = { id: newId(), argumentId, text: text.trim(), createdAt: Date.now() };
  await db.questions.add(q);
  return q;
}

export const updateQuestion = (id: string, text: string) => db.questions.update(id, { text: text.trim() });
export const deleteQuestion = (id: string) => db.questions.delete(id);

export async function addCxEntry(entry: Omit<CxEntry, 'id' | 'createdAt'>): Promise<CxEntry> {
  const e: CxEntry = { ...entry, id: newId(), createdAt: Date.now() };
  await db.cx.add(e);
  return e;
}

export const updateCxEntry = (id: string, patch: Partial<Pick<CxEntry, 'question' | 'answer' | 'concession' | 'asker'>>) =>
  db.cx.update(id, patch);
export const deleteCxEntry = (id: string) => db.cx.delete(id);

/** How a crossfire concession reads when dropped onto the flow. */
export const formatConcession = (e: CxEntry) =>
  `[CX ${e.segment}] ${e.answer.trim() || e.question.trim()}`;

export async function setHiddenColumns(roundId: string, sheet: Side, hidden: Speech[] | null) {
  const round = await db.rounds.get(roundId);
  if (!round) return;
  const hiddenCols = { ...round.hiddenCols };
  if (hidden === null) delete hiddenCols[sheet];
  else hiddenCols[sheet] = hidden;
  await db.rounds.update(roundId, { hiddenCols });
}

export const updateQuestionAnswer = (id: string, answer: string) => db.questions.update(id, { answer });

// ---- Cases (your own constructive) ----

async function addContentionArgument(c: Case, title: string): Promise<string> {
  const a: Argument = { id: newId(), resolutionId: c.resolutionId, side: c.side, title: title.trim(), caseId: c.id, createdAt: Date.now() };
  await db.args.add(a);
  return a.id;
}

export async function createCase(resolutionId: string, side: Side, title: string): Promise<Case> {
  const c: Case = { id: newId(), resolutionId, side, title: title.trim(), createdAt: Date.now() };
  await db.transaction('rw', [db.cases, db.sections, db.args], async () => {
    await db.cases.add(c);
    await db.sections.bulkAdd([
      { id: newId(), caseId: c.id, order: 0, type: 'text', title: 'Intro', body: '' },
      {
        id: newId(),
        caseId: c.id,
        order: 1,
        type: 'contention',
        title: 'Contention 1',
        body: '',
        argumentId: await addContentionArgument(c, 'Contention 1'),
      },
    ]);
  });
  return c;
}

export const renameCase = (id: string, title: string) => db.cases.update(id, { title: title.trim() });

export async function sectionsOf(caseId: string): Promise<CaseSection[]> {
  return (await db.sections.where('caseId').equals(caseId).toArray()).sort((a, b) => a.order - b.order);
}

/** Copy a case (e.g. a lay version or a 3:45 cut). Contentions share their frontlines and CX prep with the original. */
export async function duplicateCase(id: string, title: string): Promise<Case | undefined> {
  const orig = await db.cases.get(id);
  if (!orig) return undefined;
  const c: Case = { ...orig, id: newId(), title: title.trim(), createdAt: Date.now() };
  await db.transaction('rw', [db.cases, db.sections], async () => {
    await db.cases.add(c);
    await db.sections.bulkAdd((await sectionsOf(id)).map((s) => ({ ...s, id: newId(), caseId: c.id })));
  });
  return c;
}

/** Delete contention arguments no remaining section uses, with their frontlines and CX prep. */
async function dropUnusedContentions(argIds: string[]) {
  for (const argId of argIds) {
    if ((await db.sections.filter((s) => s.argumentId === argId).count()) === 0) await deleteArgument(argId);
  }
}

export async function deleteCase(id: string) {
  await db.transaction('rw', [db.cases, db.sections, db.args, db.responses, db.questions, db.rows, db.rounds, db.reviews], async () => {
    const sections = await db.sections.where('caseId').equals(id).toArray();
    await db.sections.where('caseId').equals(id).delete();
    await db.cases.delete(id);
    await db.rounds.filter((r) => r.caseId === id).modify({ caseId: undefined });
    await dropUnusedContentions(sections.map((s) => s.argumentId).filter((x): x is string => !!x));
  });
}

export async function addSection(caseId: string, type: CaseSection['type'], afterOrder?: number): Promise<CaseSection> {
  return db.transaction('rw', [db.cases, db.sections, db.args], async () => {
    const c = (await db.cases.get(caseId))!;
    const existing = await sectionsOf(caseId);
    const order = afterOrder === undefined ? existing.length : afterOrder + 1;
    for (const s of existing) if (s.order >= order) await db.sections.update(s.id, { order: s.order + 1 });
    const n = existing.filter((s) => s.type === 'contention').length + 1;
    const title = type === 'contention' ? `Contention ${n}` : '';
    const section: CaseSection = {
      id: newId(),
      caseId,
      order,
      type,
      title,
      body: '',
      argumentId: type === 'contention' ? await addContentionArgument(c, title) : undefined,
    };
    await db.sections.add(section);
    return section;
  });
}

export async function updateSection(id: string, patch: Partial<Pick<CaseSection, 'title' | 'body'>>) {
  await db.transaction('rw', [db.sections, db.args], async () => {
    const s = await db.sections.get(id);
    if (!s) return;
    await db.sections.update(id, patch);
    // Keep the contention's bank argument named like the contention.
    if (patch.title !== undefined && s.argumentId && patch.title.trim()) await db.args.update(s.argumentId, { title: patch.title.trim() });
  });
}

export async function moveSection(id: string, dir: -1 | 1) {
  await db.transaction('rw', db.sections, async () => {
    const s = await db.sections.get(id);
    if (!s) return;
    const all = await sectionsOf(s.caseId);
    const i = all.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= all.length) return;
    await db.sections.update(all[i].id, { order: all[j].order });
    await db.sections.update(all[j].id, { order: all[i].order });
  });
}

export async function deleteSection(id: string) {
  await db.transaction('rw', [db.sections, db.args, db.responses, db.questions, db.rows, db.reviews], async () => {
    const s = await db.sections.get(id);
    if (!s) return;
    await db.sections.delete(id);
    if (s.argumentId) await dropUnusedContentions([s.argumentId]);
  });
}

/** Fill a new round's "our case" sheet with one row per contention, linked to its prep. */
export async function seedOurCaseRows(round: Round) {
  if (!round.caseId) return;
  const contentions = (await sectionsOf(round.caseId)).filter((s) => s.type === 'contention');
  if (!contentions.length) return;
  const constructive: Speech = round.ourSide === 'PRO' ? 'PC' : 'CC';
  await db.transaction('rw', [db.rows, db.cells], async () => {
    await db.rows.where({ roundId: round.id, sheet: round.ourSide }).delete();
    for (const [order, s] of contentions.entries()) {
      const row: FlowRow = { id: newId(), roundId: round.id, sheet: round.ourSide, order, argumentId: s.argumentId };
      await db.rows.add(row);
      await db.cells.add({ id: newId(), roundId: round.id, rowId: row.id, speech: constructive, text: s.title, linkedResponseIds: [] });
    }
  });
}

export const setRowPlan = (rowId: string, plan: 'go' | 'drop') => db.rows.update(rowId, { plan });
export const setWeighing = (roundId: string, weighing: string) => db.rounds.update(roundId, { weighing });

// ---- Flashcards ----

export async function recordReview(responseId: string, grade: Grade, now = Date.now()): Promise<Review> {
  return db.transaction('rw', db.reviews, async () => {
    const next = rate(await db.reviews.get(responseId), responseId, grade, now);
    await db.reviews.put(next);
    return next;
  });
}

export const resetReviews = (responseIds: string[]) => db.reviews.bulkDelete(responseIds);

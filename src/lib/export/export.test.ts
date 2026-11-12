import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { Argument, BankResponse, CxEntry, CxQuestion, FlowCell, FlowRow, Resolution, Round } from '../../types';
import { renderBankDocx } from './docx';
import { buildBankDoc, buildFlowWorkbook, fileName } from './model';
import { renderFlowXlsx } from './xlsx';

// jsdom's Blob has no arrayBuffer(); FileReader works in both jsdom and browsers.
const bytes = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });

const res: Resolution = { id: 'res', title: 'Resolved: ban plastics', createdAt: 0 };
const arg = (id: string, side: 'PRO' | 'CON', title: string, extra: Partial<Argument> = {}): Argument => ({
  id,
  resolutionId: 'res',
  side,
  title,
  createdAt: id.length,
  ...extra,
});
const args = [arg('jobs', 'CON', 'Ban costs jobs'), arg('empty', 'CON', 'No responses yet'), arg('ocean', 'PRO', 'Oceans'), arg('c1', 'PRO', 'C1: Health', { caseId: 'case' })];
const resp = (id: string, argumentId: string, extra: Partial<BankResponse> = {}): BankResponse => ({
  id,
  argumentId,
  kind: 'NU',
  isCard: true,
  tag: `Tag ${id}`,
  text: `Text ${id}`,
  cite: `Smith 23, ${id}`,
  strength: 2,
  timesUsed: 0,
  createdAt: 0,
  ...extra,
});
const responses = [resp('r1', 'jobs', { url: 'https://example.com/r1' }), resp('r2', 'jobs', { kind: 'LINK_TURN', createdAt: 1 }), resp('r3', 'ocean'), resp('f1', 'c1', { against: 'Data is weak' })];
const questions: CxQuestion[] = [
  { id: 'q1', argumentId: 'jobs', text: 'Where is the evidence?', createdAt: 0 },
  { id: 'q2', argumentId: 'c1', text: 'Isn’t the data weak?', answer: 'No, it’s peer reviewed', createdAt: 0 },
];
const opts = { includeText: true, includeQuestions: true, includeFrontlines: true };

describe('bank document', () => {
  it('groups opponent arguments by side, then your frontlines, skipping empty arguments', () => {
    const doc = buildBankDoc({ resolution: res, args, responses, questions, options: opts, sideLabels: 'procon', now: new Date(0) });
    expect(doc.title).toBe('Resolved: ban plastics');
    expect(doc.sections.map((s) => s.heading)).toEqual(['Con arguments', 'Pro arguments', 'Your contentions: frontlines']);
    expect(doc.sections[0].arguments.map((a) => a.title)).toEqual(['Ban costs jobs']);
    expect(doc.sections[0].arguments[0].responses.map((r) => r.label)).toEqual(['NU', 'LT']);
    const fl = doc.sections[2].arguments[0];
    expect(fl.responses[0]).toMatchObject({ label: 'FL', against: 'Data is weak' });
    expect(fl.questions[0]).toEqual({ question: 'Isn’t the data weak?', answer: 'No, it’s peer reviewed' });
  });

  it('honours the options and the Aff/Neg wording', () => {
    const doc = buildBankDoc({
      resolution: res,
      args,
      responses,
      questions,
      options: { includeText: false, includeQuestions: false, includeFrontlines: false },
      sideLabels: 'affneg',
      now: new Date(0),
    });
    expect(doc.sections.map((s) => s.heading)).toEqual(['Neg arguments', 'Aff arguments']);
    expect(doc.sections[0].arguments[0].responses[0].text).toBeUndefined();
    expect(doc.sections[0].arguments[0].questions).toEqual([]);
  });

  it('can export a single argument', () => {
    const doc = buildBankDoc({ resolution: res, args, responses, questions, options: { ...opts, argumentId: 'jobs' }, sideLabels: 'procon', now: new Date(0) });
    expect(doc.title).toBe('Ban costs jobs');
    expect(doc.sections).toHaveLength(1);
  });

  it('renders a Word file with the content', async () => {
    const doc = buildBankDoc({ resolution: res, args, responses, questions, options: opts, sideLabels: 'procon', now: new Date(0) });
    const blob = await renderBankDocx(doc);
    const zip = await JSZip.loadAsync(await bytes(blob));
    const xml = await zip.file('word/document.xml')!.async('string');
    for (const s of ['Resolved: ban plastics', 'Con arguments', 'Tag r1', 'Smith 23, r1', 'Text r2', 'Data is weak', 'Where is the evidence?']) expect(xml).toContain(s);
  });
});

describe('flow workbook', () => {
  const round: Round = {
    id: 'R',
    resolutionId: 'res',
    tournament: 'Harvard',
    roundName: 'R4',
    ourSide: 'PRO',
    speakingOrder: 2,
    opponents: 'Lincoln AB',
    judge: 'Kim',
    judgeType: 'FLOW',
    prepSeconds: 180,
    weighing: 'Scope first',
    createdAt: 0,
  };
  const rows: FlowRow[] = [
    { id: 't1', roundId: 'R', sheet: 'CON', order: 0, argumentId: 'jobs' },
    { id: 't2', roundId: 'R', sheet: 'CON', order: 1 },
    { id: 'o1', roundId: 'R', sheet: 'PRO', order: 0 },
  ];
  const cell = (rowId: string, speech: FlowCell['speech'], text: string, kind?: FlowCell['kind']): FlowCell => ({
    id: rowId + speech,
    roundId: 'R',
    rowId,
    speech,
    text,
    kind,
    linkedResponseIds: [],
  });
  const cells = [cell('t1', 'CC', 'C1: jobs'), cell('t1', 'PR', '[NU] Tag r1'), cell('t1', 'CS', 'extend', 'WEIGHING'), cell('o1', 'PC', 'C1: Health'), cell('o1', 'PS', 'note')];
  const cx: CxEntry[] = [{ id: 'x', roundId: 'R', segment: 'CF1', asker: 'PRO', question: 'Q?', answer: 'A.', concession: true, createdAt: 0 }];

  it('lays out each case in speaking order, keeping hidden columns only when they have notes', () => {
    const m = buildFlowWorkbook({ round, resolutionTitle: res.title, rows, cells, args, cx, sideLabels: 'procon' });
    expect(m.title).toBe('Harvard · R4');
    expect(m.sheets.map((s) => s.name)).toEqual(['Their case (Con)', 'Our case (Pro)']);
    // Con speaks first; on the Con sheet PC and CR are hidden by default and empty, so they're left out.
    expect(m.sheets[0].columns.map((c) => c.code)).toEqual(['CC', 'PR', 'CS', 'PS', 'CFF', 'PFF']);
    expect(m.sheets[0].rows).toEqual([{ argument: 'Ban costs jobs', cells: ['C1: jobs', '[NU] Tag r1', '[WGH] extend', '', '', ''] }]);
    expect(m.sheets[1].rows[0].cells[0]).toBe('C1: Health');
    expect(m.info).toContainEqual(['Weighing', 'Scope first']);
    expect(m.cx[0]).toEqual({ crossfire: 'First crossfire', askedBy: 'Us', question: 'Q?', answer: 'A.', concession: true });
  });

  it('renders an Excel file with a sheet per case and the crossfire log', async () => {
    const m = buildFlowWorkbook({ round, resolutionTitle: res.title, rows, cells, args, cx, sideLabels: 'affneg' });
    const blob = await renderFlowXlsx(m);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await bytes(blob));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Round', 'Their case (Neg)', 'Our case (Aff)', 'Crossfire']);
    const their = wb.getWorksheet('Their case (Neg)')!;
    expect(their.getCell('B1').value).toBe('NC · Neg Constructive');
    expect(their.getCell('C1').value).toBe('AR · Aff Rebuttal (us)');
    expect(their.getCell('C2').value).toBe('[NU] Tag r1');
    expect(their.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: 1 });
    expect(wb.getWorksheet('Crossfire')!.getCell('E2').value).toBe('★ Yes');
  });
});

describe('fileName', () => {
  it('makes a safe file name', () => {
    expect(fileName('Resolved: The US should ban single-use plastics!', 'bank', 'docx')).toBe('Resolved-The-US-should-ban-single-use-plastics-bank.docx');
    expect(fileName('???', 'flow', 'xlsx')).toBe('u-flow-flow.xlsx');
  });
});

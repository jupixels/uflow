import { type SideLabels, sideName, speechCode, speechName } from '../labels';
import { flowColumns, firstSpeakingSide, hiddenColumns, speechSide } from '../speeches';
import {
  type Argument,
  type BankResponse,
  CX_SEGMENTS,
  type CxEntry,
  type CxQuestion,
  type FlowCell,
  type FlowRow,
  KIND_LABELS,
  KIND_NAMES,
  type Resolution,
  type Round,
  type Side,
} from '../../types';

// ---- Rebuttal bank → Word / PDF ----

export interface BankDocOptions {
  /** Include card text / explanations, not just tags and cites. */
  includeText: boolean;
  includeQuestions: boolean;
  /** Include your own contentions with their frontlines. */
  includeFrontlines: boolean;
  /** Only this argument; otherwise the whole resolution. */
  argumentId?: string;
}

export interface DocResponse {
  /** Short type label shown before the tag, e.g. NU or FL. */
  label: string;
  kindName: string;
  tag: string;
  cite?: string;
  url?: string;
  text?: string;
  /** For frontlines: what the other team says. */
  against?: string;
  strength: 1 | 2 | 3;
}

export interface DocArgument {
  title: string;
  responses: DocResponse[];
  questions: { question: string; answer?: string }[];
}

export interface DocSection {
  heading: string;
  arguments: DocArgument[];
}

export interface BankDoc {
  title: string;
  subtitle: string;
  sections: DocSection[];
}

export function buildBankDoc(input: {
  resolution: Resolution;
  args: Argument[];
  responses: BankResponse[];
  questions: CxQuestion[];
  options: BankDocOptions;
  sideLabels: SideLabels;
  now: Date;
}): BankDoc {
  const { resolution, options: o, sideLabels } = input;
  const byCreated = <T extends { createdAt: number }>(xs: T[]) => [...xs].sort((a, b) => a.createdAt - b.createdAt);
  const args = byCreated(input.args.filter((a) => a.resolutionId === resolution.id && (!o.argumentId || a.id === o.argumentId)));

  const docArg = (a: Argument): DocArgument => {
    const own = !!a.caseId;
    return {
      title: a.title,
      responses: byCreated(input.responses.filter((r) => r.argumentId === a.id)).map((r) => ({
        label: own ? 'FL' : KIND_LABELS[r.kind],
        kindName: own ? 'Frontline' : KIND_NAMES[r.kind],
        tag: r.tag,
        cite: r.cite || undefined,
        url: r.url || undefined,
        text: o.includeText ? r.text.trim() || undefined : undefined,
        against: r.against || undefined,
        strength: r.strength,
      })),
      questions: o.includeQuestions
        ? byCreated(input.questions.filter((q) => q.argumentId === a.id)).map((q) => ({ question: q.text, answer: own ? q.answer || undefined : undefined }))
        : [],
    };
  };
  const hasContent = (d: DocArgument) => d.responses.length > 0 || d.questions.length > 0;

  const sections: DocSection[] = [];
  for (const side of ['CON', 'PRO'] as Side[]) {
    const list = args.filter((a) => a.side === side && !a.caseId).map(docArg).filter(hasContent);
    if (list.length) sections.push({ heading: `${sideName(side, sideLabels)} arguments`, arguments: list });
  }
  if (o.includeFrontlines || o.argumentId) {
    const list = args.filter((a) => a.caseId).map(docArg).filter(hasContent);
    if (list.length) sections.push({ heading: 'Your contentions: frontlines', arguments: list });
  }

  const single = o.argumentId ? args[0] : undefined;
  return {
    title: single ? single.title : resolution.title,
    subtitle: `${single ? `${resolution.title} · ` : ''}U Flow bank · exported ${input.now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`,
    sections,
  };
}

// ---- Flow → Excel ----

export interface FlowColumnModel {
  code: string;
  name: string;
  ours: boolean;
}

export interface FlowSheetModel {
  name: string;
  columns: FlowColumnModel[];
  rows: { argument: string; cells: string[] }[];
}

export interface CxRowModel {
  crossfire: string;
  askedBy: string;
  question: string;
  answer: string;
  concession: boolean;
}

export interface FlowWorkbookModel {
  title: string;
  info: [string, string][];
  sheets: FlowSheetModel[];
  cx: CxRowModel[];
}

const CX_NAMES: Record<(typeof CX_SEGMENTS)[number], string> = { CF1: 'First crossfire', CF2: 'Second crossfire', GCF: 'Grand crossfire' };

/**
 * One sheet per case, columns in speaking order. A column is included if it's
 * shown on that sheet or has anything written in it; empty trailing rows are dropped.
 */
export function buildFlowWorkbook(input: {
  round: Round;
  resolutionTitle: string;
  rows: FlowRow[];
  cells: FlowCell[];
  args: Argument[];
  cx: CxEntry[];
  sideLabels: SideLabels;
}): FlowWorkbookModel {
  const { round, sideLabels: m } = input;
  const first = firstSpeakingSide(round.ourSide, round.speakingOrder);
  const columns = flowColumns(first);
  const theirs: Side = round.ourSide === 'PRO' ? 'CON' : 'PRO';
  const argTitle = new Map(input.args.map((a) => [a.id, a.title]));
  const cellAt = new Map(input.cells.map((c) => [`${c.rowId}:${c.speech}`, c]));
  const textOf = (rowId: string, s: (typeof columns)[number]) => {
    const c = cellAt.get(`${rowId}:${s}`);
    if (!c) return '';
    const text = c.text.trim();
    // Keep a tag you set by hand (Alt+1–6) visible in the sheet.
    const tag = c.kind ? `[${KIND_LABELS[c.kind]}]` : '';
    return tag && !text.startsWith(tag) ? `${tag} ${text}`.trim() : text;
  };

  const sheets = ([theirs, round.ourSide] as Side[]).map((sheet): FlowSheetModel => {
    const rows = input.rows.filter((r) => r.sheet === sheet).sort((a, b) => a.order - b.order);
    const hidden = hiddenColumns(round.hiddenCols, sheet, first);
    const cols = columns.filter((s) => !hidden.includes(s) || rows.some((r) => textOf(r.id, s)));
    const out = rows.map((r) => ({ argument: (r.argumentId && argTitle.get(r.argumentId)) || '', cells: cols.map((s) => textOf(r.id, s)) }));
    while (out.length && !out[out.length - 1].argument && out[out.length - 1].cells.every((c) => !c)) out.pop();
    return {
      name: `${sheet === round.ourSide ? 'Our case' : 'Their case'} (${sideName(sheet, m)})`,
      columns: cols.map((s) => ({ code: speechCode(s, m), name: speechName(s, m), ours: speechSide(s) === round.ourSide })),
      rows: out,
    };
  });

  const cx = [...input.cx]
    .sort((a, b) => CX_SEGMENTS.indexOf(a.segment) - CX_SEGMENTS.indexOf(b.segment) || a.createdAt - b.createdAt)
    .map((e) => ({
      crossfire: CX_NAMES[e.segment],
      askedBy: e.asker === round.ourSide ? 'Us' : 'Them',
      question: e.question,
      answer: e.answer,
      concession: e.concession,
    }));

  const title = [round.tournament, round.roundName].filter(Boolean).join(' · ') || 'Round';
  const info: [string, string][] = [
    ['Resolution', input.resolutionTitle],
    ['Tournament', round.tournament],
    ['Round', round.roundName],
    ['Our side', sideName(round.ourSide, m)],
    ['We speak', round.speakingOrder === 1 ? 'First' : 'Second'],
    ['Opponents', round.opponents],
    ['Judge', round.judge ? `${round.judge} (${round.judgeType.toLowerCase()})` : round.judgeType.toLowerCase()],
    ['Date', new Date(round.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })],
  ];
  if (round.weighing?.trim()) info.push(['Weighing', round.weighing.trim()]);
  return { title, info: info.filter(([, v]) => v), sheets, cx };
}

/** A safe file name from a title. */
export function fileName(title: string, suffix: string, ext: string): string {
  const base = title
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'u-flow'}-${suffix}.${ext}`;
}

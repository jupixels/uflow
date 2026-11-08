import { db } from '../db';
import { withoutCopiedKind } from './explain';
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
  Review,
  Round,
  RoundEdit,
} from '../types';

export const EXPORT_VERSION = 6;

export interface ExportFile {
  /** Internal file ID from the app's original name; kept so older backups still import. */
  app: 'rebuttal-flow';
  version: number;
  exportedAt: string;
  resolutions: Resolution[];
  args: Argument[];
  responses: BankResponse[];
  rounds: Round[];
  rows: FlowRow[];
  cells: FlowCell[];
  questions: CxQuestion[];
  cx: CxEntry[];
  cases: Case[];
  sections: CaseSection[];
  reviews: Review[];
  roundEdits: RoundEdit[];
}

const TABLES = ['resolutions', 'args', 'responses', 'rounds', 'rows', 'cells', 'questions', 'cx', 'cases', 'sections', 'reviews', 'roundEdits'] as const;

export async function exportAll(): Promise<ExportFile> {
  const [resolutions, args, responses, rounds, rows, cells, questions, cx, cases, sections, reviews, roundEdits] = await Promise.all(
    TABLES.map((t) => db.table(t).toArray()),
  );
  return {
    app: 'rebuttal-flow',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    resolutions,
    args,
    responses,
    rounds,
    rows,
    cells,
    questions,
    cx,
    cases,
    sections,
    reviews,
    roundEdits,
  } as ExportFile;
}

export interface ImportResult {
  counts: Record<(typeof TABLES)[number], number>;
}

/** Validate an export file. Throws with a readable message when it isn't one. */
export function parseExport(json: string): ExportFile {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  const d = data as Partial<ExportFile>;
  if (!d || typeof d !== 'object' || d.app !== 'rebuttal-flow') {
    throw new Error('This is not a U Flow export.');
  }
  if (typeof d.version !== 'number' || d.version > EXPORT_VERSION) {
    throw new Error('This export was made by a newer version of the app.');
  }
  for (const t of TABLES) {
    const v = d[t];
    if (v !== undefined && (!Array.isArray(v) || v.some((x) => !x || typeof x.id !== 'string'))) {
      throw new Error(`Export has a malformed "${t}" list.`);
    }
  }
  return d as ExportFile;
}

/**
 * Merge an export into the local database. Records with the same id are
 * overwritten, so importing a partner's bank twice doesn't duplicate it.
 */
export async function importAll(file: ExportFile): Promise<ImportResult> {
  const counts = {} as ImportResult['counts'];
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      let items = (file[t] ?? []) as { id: string }[];
      if (t === 'cells') {
        const kinds = new Map((file.responses ?? []).map((r) => [r.id, r.kind]));
        items = (items as FlowCell[]).map((c) => {
          const cell = { ...c, linkedResponseIds: c.linkedResponseIds ?? [] };
          // Backups from before v5 may carry cell tags copied from inserted responses.
          return file.version < 5 ? withoutCopiedKind(cell, (id) => kinds.get(id)) : cell;
        });
      }
      await db.table(t).bulkPut(items);
      counts[t] = items.length;
    }
  });
  return { counts };
}

/** Bank-only export (no rounds), for sharing blocks with a partner. */
export async function exportBank(resolutionId?: string): Promise<ExportFile> {
  const all = await exportAll();
  const resolutions = resolutionId ? all.resolutions.filter((r) => r.id === resolutionId) : all.resolutions;
  const resIds = new Set(resolutions.map((r) => r.id));
  const args = all.args.filter((a) => resIds.has(a.resolutionId));
  const argIds = new Set(args.map((a) => a.id));
  return {
    ...all,
    resolutions,
    args,
    responses: all.responses.filter((r) => argIds.has(r.argumentId)),
    questions: all.questions.filter((q) => argIds.has(q.argumentId)),
    cases: all.cases.filter((c) => resIds.has(c.resolutionId)),
    sections: all.sections.filter((s) => all.cases.some((c) => c.id === s.caseId && resIds.has(c.resolutionId))),
    // Flashcard progress is personal; a shared bank starts fresh for whoever imports it.
    reviews: [],
    rounds: [],
    rows: [],
    cells: [],
    cx: [],
    roundEdits: [],
  };
}

export function downloadJson(file: ExportFile, name: string) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

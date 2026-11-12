import { db } from '../../db';
import { downloadBlob } from '../data';
import type { SideLabels } from '../labels';
import { type BankDocOptions, buildBankDoc, buildFlowWorkbook, fileName } from './model';

/** Gather a resolution's bank and download it as Word or PDF. Renderers load on first use. */
export async function exportBankFile(resolutionId: string, format: 'docx' | 'pdf', options: BankDocOptions, sideLabels: SideLabels) {
  const resolution = await db.resolutions.get(resolutionId);
  if (!resolution) throw new Error('That resolution no longer exists.');
  const args = await db.args.where('resolutionId').equals(resolutionId).toArray();
  const argIds = args.map((a) => a.id);
  const [responses, questions] = await Promise.all([
    db.responses.where('argumentId').anyOf(argIds).toArray(),
    db.questions.where('argumentId').anyOf(argIds).toArray(),
  ]);
  const doc = buildBankDoc({ resolution, args, responses, questions, options, sideLabels, now: new Date() });
  if (!doc.sections.length) throw new Error('Nothing to export yet. Add some responses first.');
  const blob =
    format === 'docx' ? await (await import('./docx')).renderBankDocx(doc) : await (await import('./pdf')).renderBankPdf(doc);
  downloadBlob(blob, fileName(doc.title, 'bank', format));
}

/** Download a round's flow as an Excel workbook. */
export async function exportFlowFile(roundId: string, sideLabels: SideLabels) {
  const round = await db.rounds.get(roundId);
  if (!round) throw new Error('That round no longer exists.');
  const [resolution, rows, cells, args, cx] = await Promise.all([
    db.resolutions.get(round.resolutionId),
    db.rows.where('roundId').equals(roundId).toArray(),
    db.cells.where('roundId').equals(roundId).toArray(),
    db.args.where('resolutionId').equals(round.resolutionId).toArray(),
    db.cx.where('roundId').equals(roundId).toArray(),
  ]);
  const model = buildFlowWorkbook({ round, resolutionTitle: resolution?.title ?? '', rows, cells, args, cx, sideLabels });
  const blob = await (await import('./xlsx')).renderFlowXlsx(model);
  downloadBlob(blob, fileName([round.tournament, round.roundName, round.opponents && `vs ${round.opponents}`].filter(Boolean).join(' ') || 'round', 'flow', 'xlsx'));
}

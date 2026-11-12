import ExcelJS from 'exceljs';
import type { FlowWorkbookModel } from './model';

const HEADER_FILL = 'FFE9EDF5';
const OURS_HEADER_FILL = 'FFDCE7FB';
const OURS_FILL = 'FFF4F8FF';
const BORDER = { style: 'thin' as const, color: { argb: 'FFD0D5DD' } };
const box = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

/** An Excel workbook of a round: info, one sheet per case laid out like the flow, crossfire log. */
export async function renderFlowXlsx(model: FlowWorkbookModel): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'U Flow';
  wb.created = new Date();

  // Fit one page wide so labels and values print side by side.
  const info = wb.addWorksheet('Round', { pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  info.columns = [{ width: 16 }, { width: 80 }];
  info.addRow([model.title]).font = { bold: true, size: 16 };
  info.addRow([]);
  for (const [label, value] of model.info) {
    const row = info.addRow([label, value]);
    row.getCell(1).font = { bold: true, color: { argb: 'FF555555' } };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  }

  for (const sheet of model.sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31), {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [{ width: 26 }, ...sheet.columns.map(() => ({ width: 40 }))];
    const header = ws.addRow(['Argument', ...sheet.columns.map((c) => `${c.code} · ${c.name}${c.ours ? ' (us)' : ''}`)]);
    header.height = 30;
    header.eachCell((cell, i) => {
      const ours = i > 1 && sheet.columns[i - 2].ours;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ours ? OURS_HEADER_FILL : HEADER_FILL } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = box;
    });
    for (const r of sheet.rows) {
      const row = ws.addRow([r.argument, ...r.cells]);
      row.eachCell({ includeEmpty: true }, (cell, i) => {
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = box;
        if (i === 1) cell.font = { bold: true };
        else if (sheet.columns[i - 2]?.ours) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OURS_FILL } };
      });
    }
  }

  if (model.cx.length) {
    const ws = wb.addWorksheet('Crossfire', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Crossfire', width: 18 },
      { header: 'Asked by', width: 10 },
      { header: 'Question', width: 50 },
      { header: 'Answer', width: 50 },
      { header: 'Concession', width: 12 },
    ];
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.border = box;
    });
    for (const e of model.cx) {
      const row = ws.addRow([e.crossfire, e.askedBy, e.question, e.answer, e.concession ? '★ Yes' : '']);
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = box;
      });
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

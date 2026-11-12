import pdfMake from 'pdfmake/build/pdfmake';
import * as fonts from 'pdfmake/build/vfs_fonts';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { BankDoc } from './model';

// The fonts module exports the font files directly (CommonJS) or as `vfs` (types).
const vfs = (fonts as unknown as { vfs?: Record<string, string>; default?: Record<string, string> }).vfs ??
  (fonts as unknown as { default: Record<string, string> }).default;
pdfMake.vfs = vfs;

const ACCENT = '#1F3B73';
const MUTED = '#666666';

/** A printable PDF of the bank, laid out like the Word export. */
export function renderBankPdf(doc: BankDoc): Promise<Blob> {
  const content: Content[] = [
    { text: doc.title, style: 'title' },
    { text: doc.subtitle, color: MUTED, fontSize: 10, margin: [0, 2, 0, 16] },
  ];
  for (const section of doc.sections) {
    content.push({ text: section.heading, style: 'h1' });
    for (const arg of section.arguments) {
      content.push({ text: arg.title, style: 'h2' });
      arg.responses.forEach((r, i) => {
        const block: Content[] = [];
        if (r.against) block.push({ text: [{ text: 'They say: ', color: MUTED }, r.against], italics: true, fontSize: 10, margin: [0, 0, 0, 2] });
        block.push({
          text: [
            { text: `${i + 1}.  `, bold: true },
            { text: `[${r.label}] `, bold: true, color: ACCENT },
            { text: r.tag, bold: true },
            { text: `  ${'*'.repeat(r.strength)}`, color: '#B8860B', fontSize: 9 },
          ],
        });
        if (r.cite) block.push({ text: r.cite, italics: true, color: MUTED, fontSize: 9.5, margin: [16, 1, 0, 0] });
        if (r.text) block.push({ text: r.text, margin: [16, 3, 0, 0], lineHeight: 1.2 });
        if (r.url) block.push({ text: r.url, link: r.url, color: ACCENT, decoration: 'underline', fontSize: 8.5, margin: [16, 2, 0, 0] });
        // Keep a short response together on one page.
        content.push({ stack: block, margin: [0, 6, 0, 4], unbreakable: !r.text || r.text.length < 1200 });
      });
      if (arg.questions.length) {
        content.push({ text: 'Crossfire questions', bold: true, color: MUTED, fontSize: 10, margin: [0, 8, 0, 2] });
        content.push({
          ul: arg.questions.map((q) =>
            q.answer ? { stack: [q.question, { text: `Answer: ${q.answer}`, color: MUTED, fontSize: 10 }] } : q.question,
          ),
        });
      }
    }
  }

  const definition: TDocumentDefinitions = {
    info: { title: doc.title, creator: 'U Flow' },
    pageMargins: [54, 54, 54, 54],
    defaultStyle: { font: 'Roboto', fontSize: 11 },
    styles: {
      title: { fontSize: 22, bold: true },
      h1: { fontSize: 16, bold: true, color: ACCENT, margin: [0, 16, 0, 6] },
      h2: { fontSize: 13, bold: true, margin: [0, 12, 0, 2] },
    },
    footer: (page, pages) => ({ text: `Page ${page} of ${pages}`, alignment: 'right', fontSize: 8, color: MUTED, margin: [0, 16, 54, 0] }),
    content,
  };
  return new Promise((resolve) => pdfMake.createPdf(definition).getBlob(resolve));
}

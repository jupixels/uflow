import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from 'docx';
import type { BankDoc, DocArgument } from './model';

const FONT = 'Calibri';
const MUTED = '666666';

/** A Word document of the bank: sections → arguments → numbered responses. */
export async function renderBankDocx(doc: BankDoc): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: doc.title })] }),
    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: doc.subtitle, color: MUTED, size: 20 })] }),
  ];
  let listId = 0;
  for (const section of doc.sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360 }, children: [new TextRun(section.heading)] }));
    for (const arg of section.arguments) children.push(...argumentParagraphs(arg, `responses-${listId++}`));
  }

  const document = new Document({
    creator: 'U Flow',
    title: doc.title,
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', run: { font: FONT, size: 44, bold: true } },
        { id: 'Heading1', name: 'Heading 1', run: { font: FONT, size: 30, bold: true, color: '1F3B73' }, paragraph: { spacing: { after: 120 } } },
        { id: 'Heading2', name: 'Heading 2', run: { font: FONT, size: 25, bold: true }, paragraph: { spacing: { before: 280, after: 80 } } },
      ],
    },
    // One numbered list per argument, so numbering restarts at 1 under each heading.
    numbering: {
      config: Array.from({ length: listId }, (_, i) => ({
        reference: `responses-${i}`,
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 400, hanging: 400 } } } }],
      })),
    },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], color: MUTED, size: 18 })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBlob(document);
}

function argumentParagraphs(arg: DocArgument, list: string): Paragraph[] {
  const out: Paragraph[] = [new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun(arg.title)] })];
  for (const r of arg.responses) {
    if (r.against) {
      out.push(
        new Paragraph({
          indent: { left: 400 },
          keepNext: true,
          children: [new TextRun({ text: 'They say: ', italics: true, color: MUTED }), new TextRun({ text: r.against, italics: true })],
        }),
      );
    }
    out.push(
      new Paragraph({
        numbering: { reference: list, level: 0 },
        spacing: { before: 120 },
        keepNext: !!(r.cite || r.text || r.url),
        children: [
          new TextRun({ text: `[${r.label}] `, bold: true, color: '1F3B73' }),
          new TextRun({ text: r.tag, bold: true }),
          new TextRun({ text: `  ${'★'.repeat(r.strength)}`, color: 'B8860B', size: 18 }),
        ],
      }),
    );
    if (r.cite) out.push(new Paragraph({ indent: { left: 400 }, children: [new TextRun({ text: r.cite, italics: true, color: MUTED, size: 20 })] }));
    if (r.text) {
      for (const line of r.text.split('\n')) out.push(new Paragraph({ indent: { left: 400 }, spacing: { after: 40 }, children: [new TextRun(line)] }));
    }
    if (r.url) {
      out.push(
        new Paragraph({
          indent: { left: 400 },
          children: [new ExternalHyperlink({ link: r.url, children: [new TextRun({ text: r.url, style: 'Hyperlink', size: 18 })] })],
        }),
      );
    }
  }
  if (arg.questions.length) {
    out.push(new Paragraph({ spacing: { before: 200 }, keepNext: true, children: [new TextRun({ text: 'Crossfire questions', bold: true, color: MUTED })] }));
    for (const q of arg.questions) {
      out.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(q.question)] }));
      if (q.answer) out.push(new Paragraph({ indent: { left: 720 }, children: [new TextRun({ text: `Answer: ${q.answer}`, color: MUTED })] }));
    }
  }
  return out;
}

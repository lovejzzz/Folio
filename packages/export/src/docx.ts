import { AlignmentType, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, TextRun, type ISectionOptions } from 'docx';
import { docLabels, type Block, type SemanticDoc } from '@folio/core';
import { printPalette } from '@folio/ui/tokens';
import { renderBlock, runs, type BlockCtx, type DocxChild } from './docxBlocks';
import { MARGIN, SIZE, contentWidth, documentStyles, fontFor, numbering, pageSize } from './docxTheme';
import { exportLabels } from './labels';

export interface DocxOptions {
  courseTitle: string;
}

/** Page breaks at either end of a material would only leave blank pages. */
function trimBreaks(blocks: Block[]): Block[] {
  let start = 0;
  let end = blocks.length;
  while (start < end && blocks[start]?.t === 'break') start += 1;
  while (end > start && blocks[end - 1]?.t === 'break') end -= 1;
  return blocks.slice(start, end);
}

function footer(doc: SemanticDoc, courseTitle: string): Footer {
  const style = { size: SIZE.small, color: printPalette.ink2, font: fontFor(doc.language, 'body') };
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ ...style, text: `${courseTitle} · ${doc.title} · ` }),
          new TextRun({ ...style, children: [PageNumber.CURRENT] }),
        ],
      }),
    ],
  });
}

/** One material as its own section, so it starts on a fresh page with its own footer. */
function section(doc: SemanticDoc, courseTitle: string, lists: { count: number }): ISectionOptions {
  const l = docLabels(doc.language);
  const ctx: BlockCtx = {
    language: doc.language,
    l,
    x: exportLabels(doc.language),
    width: contentWidth(doc.language),
    lists,
    lesson: '',
  };
  const copy = doc.audience === 'teacher' ? l.teacherCopy : l.studentCopy;
  const children: DocxChild[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs(ctx, doc.title, { role: 'heading' }) }),
    new Paragraph({
      spacing: { after: 360 },
      children: runs(ctx, `${courseTitle} · ${copy}`, { color: printPalette.ink2 }),
    }),
  ];
  for (const block of trimBreaks(doc.blocks)) children.push(...renderBlock(ctx, block));
  return {
    properties: {
      page: {
        size: pageSize(doc.language),
        margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, footer: Math.round(MARGIN / 2) },
      },
    },
    footers: { default: footer(doc, courseTitle) },
    children,
  };
}

/**
 * One Word file holding the given materials in order, each starting on a new
 * page under its own Heading 1. Uses real heading styles, numbering and
 * table header rows, so Word's navigation pane and table of contents work.
 */
export async function renderDocx(docs: SemanticDoc[], opts: DocxOptions): Promise<Uint8Array> {
  const first = docs[0];
  if (!first) throw new Error('Choose at least one material to export.');
  const lists = { count: 0 };
  const document = new Document({
    title: opts.courseTitle,
    creator: 'Folio',
    styles: documentStyles(first.language),
    numbering: numbering(),
    sections: docs.map((doc) => section(doc, opts.courseTitle, lists)),
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}

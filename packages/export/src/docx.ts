import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { AlignmentType, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, TextRun, type ISectionOptions } from 'docx';
import { cleanText, docLabels, type Block, type SemanticDoc } from '@folio/core';
import { printPalette } from '@folio/ui/tokens';
import { renderBlock, runs, type BlockCtx, type DocxChild } from './docxBlocks';
import { MARGIN, SIZE, contentWidth, documentStyles, fontFor, numbering, pageSize } from './docxTheme';
import { exportLabels } from './labels';
import { placePictures, type PlacedPicture } from './docxImages';
import { resolvePictures, type MediaResolver, type ResolvedMedia } from './media';
import { ExportError } from './errors';
import { cleanDoc } from './xml';

export interface DocxOptions {
  courseTitle: string;
  /** Turns a picture's reference into its bytes. Without it, pictures are said in words. */
  media?: MediaResolver;
}

/** Page breaks at either end of a material would only leave blank pages. */
function trimBreaks(blocks: Block[]): Block[] {
  let start = 0;
  let end = blocks.length;
  while (start < end && blocks[start]?.t === 'break') start += 1;
  while (end > start && blocks[end - 1]?.t === 'break') end -= 1;
  return blocks.slice(start, end);
}

/** Every page of a teacher copy says so at its foot: a page that strays onto a student's desk shows what it is. */
function footer(doc: SemanticDoc, courseTitle: string): Footer {
  const style = { size: SIZE.small, color: printPalette.ink2, font: fontFor(doc.language, 'body') };
  const teacher = doc.audience === 'teacher' ? [new TextRun({ ...style, bold: true, color: printPalette.ink, text: `${docLabels(doc.language).teacherCopy} · ` })] : [];
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          ...teacher,
          new TextRun({ ...style, text: `${courseTitle} · ${doc.title} · ` }),
          new TextRun({ ...style, children: [PageNumber.CURRENT] }),
        ],
      }),
    ],
  });
}

/** The pictures a file may show, and those it has placed so far. */
interface Pictures {
  images: ReadonlyMap<string, ResolvedMedia>;
  placed: PlacedPicture[];
}

/** One material as its own section, so it starts on a fresh page with its own footer. */
function section(doc: SemanticDoc, courseTitle: string, lists: { count: number }, pictures: Pictures): ISectionOptions {
  const l = docLabels(doc.language);
  const ctx: BlockCtx = {
    language: doc.language,
    l,
    x: exportLabels(doc.language),
    width: contentWidth(doc.language),
    lists,
    lesson: '',
    ...pictures,
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
  docs = cleanDoc(docs);
  const courseTitle = cleanText(opts.courseTitle);
  const first = docs[0];
  if (!first) throw new ExportError('noMaterials', 'Choose at least one material to export.');
  const lists = { count: 0 };
  const pictures: Pictures = { images: await resolvePictures(docs, opts.media), placed: [] };
  const document = new Document({
    title: courseTitle,
    creator: 'Folio',
    styles: documentStyles(first.language),
    numbering: numbering(),
    sections: docs.map((doc) => section(doc, courseTitle, lists, pictures)),
  });
  return tidyForPages(new Uint8Array(await Packer.toArrayBuffer(document)), pictures.placed);
}

const NORMAL = '<w:style w:type="paragraph" w:styleId="Normal">';
/** The empty paragraph the docx library ends each material with, to hold its page settings. */
const SECTION_BREAK = '<w:p><w:pPr><w:sectPr>';

/**
 * Two things the docx library can't say, which Pages reads differently from Word:
 * - Normal is the default paragraph style. Without the mark, Pages gave a paragraph with no style of its own
 *   the style of the heading before it: body text came out bold and large.
 * - The paragraph that ends each material is a hairline. At full height it spilled onto a page of its own
 *   whenever a material filled its last page, leaving a blank page.
 * The pictures go in here too, while the file is open (see docxImages).
 */
export function tidyForPages(file: Uint8Array, pictures: readonly PlacedPicture[] = []): Uint8Array {
  const parts = unzipSync(file);
  const styles = parts['word/styles.xml'];
  const document = parts['word/document.xml'];
  if (!styles || !document) return file;
  parts['word/styles.xml'] = strToU8(strFromU8(styles).replace(NORMAL, '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">'));
  parts['word/document.xml'] = strToU8(
    strFromU8(document).replaceAll(SECTION_BREAK, '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:sectPr>'),
  );
  placePictures(parts, pictures);
  return zipSync(parts as Zippable, { level: 6 });
}

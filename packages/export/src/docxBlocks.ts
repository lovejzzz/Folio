import {
  BorderStyle,
  HeadingLevel,
  LineRuleType,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';
import { textRuns, type Block, type DocLabels, type Language } from '@folio/core';
import { printFonts, printPalette } from '@folio/ui/tokens';
import { choiceLetter, type ExportLabels } from './labels';
import { pictureMark, type PlacedPicture } from './docxImages';
import { wordImageType, type ResolvedMedia } from './media';
import { BULLETS, NUMBERS, SIZE, fontFor, hairline, type FontRole } from './docxTheme';

export type DocxChild = Paragraph | Table;

/** Rendering state for one document. */
export interface BlockCtx {
  language: Language;
  l: DocLabels;
  x: ExportLabels;
  width: number;
  /** Numbering instance counter shared by the whole file, so each ordered list restarts at 1. */
  lists: { count: number };
  /** The last lesson a slide belonged to, to add a heading when it changes. */
  lesson: string;
  /** The pictures that could be read, by reference: the rest are said in words. */
  images?: ReadonlyMap<string, ResolvedMedia>;
  /** Each picture placed so far, in order: put into the file once it is made (see docxImages). */
  placed?: PlacedPicture[];
}

type RunStyle = Omit<IRunOptions, 'text' | 'children' | 'break' | 'font'> & { role?: FontRole };

/**
 * Runs for text that may hold line breaks; every run carries the course fonts,
 * code marked with backticks takes the mono face on a light well, and β̂_educ
 * or R^2 become real sub- and superscripts.
 */
export function runs(ctx: BlockCtx, text: string, style: RunStyle = {}): TextRun[] {
  const { role = 'body', ...rest } = style;
  return text.split('\n').flatMap((line, i) =>
    textRuns(line).map(
      (r, j) =>
        new TextRun({
          ...rest,
          text: r.text + (r.accent ?? ''),
          font: fontFor(ctx.language, role),
          ...(r.code ? CODE_RUN(role, rest.size) : {}),
          ...(r.bold ? { bold: true } : {}),
          ...(r.script === 'sub' ? { subScript: true } : r.script === 'sup' ? { superScript: true } : {}),
          ...(i && !j ? { break: 1 } : {}),
        }),
    ),
  );
}

/** Consolas sets larger than Georgia at one size, so body code drops a point; headings keep theirs. */
const CODE_RUN = (role: FontRole, size: IRunOptions['size']): Partial<IRunOptions> => ({
  font: { ascii: printFonts.mono, hAnsi: printFonts.mono, cs: printFonts.mono },
  shading: { type: ShadingType.CLEAR, color: 'auto', fill: printPalette.well },
  ...(role === 'body' ? { size: (typeof size === 'number' ? size : SIZE.body) - 2 } : {}),
});

const HEADINGS = {
  1: HeadingLevel.HEADING_2,
  2: HeadingLevel.HEADING_3,
  3: HeadingLevel.HEADING_4,
} as const;

/** Document headings sit one level below the material title, which is Heading 1. */
function heading(ctx: BlockCtx, level: 1 | 2 | 3, text: string): Paragraph {
  return new Paragraph({ heading: HEADINGS[level], children: runs(ctx, text, { role: 'heading' }) });
}

function para(ctx: BlockCtx, text: string, tone?: 'lead' | 'muted'): Paragraph {
  const style: RunStyle = tone === 'lead' ? { size: SIZE.lead } : tone === 'muted' ? { color: printPalette.ink2 } : {};
  return new Paragraph({ children: runs(ctx, text, style) });
}

function list(ctx: BlockCtx, ordered: boolean, items: string[]): Paragraph[] {
  const instance = (ctx.lists.count += 1);
  return items.map(
    (item) =>
      new Paragraph({
        numbering: ordered ? { reference: NUMBERS, level: 0, instance } : { reference: BULLETS, level: 0 },
        spacing: { after: 60 },
        children: runs(ctx, item),
      }),
  );
}

function cellParagraphs(ctx: BlockCtx, text: string, style: RunStyle): Paragraph[] {
  return text.split('\n').map((line) => new Paragraph({ spacing: { after: 40, line: 276 }, children: runs(ctx, line, style) }));
}

function columnWidths(ctx: BlockCtx, count: number, weights?: number[]): number[] {
  const w = weights && weights.length === count ? weights : Array.from({ length: count }, () => 1);
  const total = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((v) => Math.floor((ctx.width * v) / total));
}

function table(ctx: BlockCtx, head: string[], rows: string[][], weights?: number[]): Table {
  const count = Math.max(head.length, ...rows.map((r) => r.length), 1);
  const widths = columnWidths(ctx, count, weights);
  const cell = (text: string, i: number, header: boolean) =>
    new TableCell({
      width: { size: widths[i] ?? 0, type: WidthType.DXA },
      ...(header ? { shading: { type: ShadingType.CLEAR, fill: printPalette.well, color: 'auto' } } : {}),
      children: cellParagraphs(ctx, text, header ? { bold: true } : {}),
    });
  const pad = (row: string[]) => Array.from({ length: count }, (_, i) => row[i] ?? '');
  return new Table({
    width: { size: ctx.width, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    margins: { top: 80, bottom: 40, left: 110, right: 110 },
    borders: { top: hairline, bottom: hairline, left: hairline, right: hairline, insideHorizontal: hairline, insideVertical: hairline },
    rows: [
      ...(head.length ? [new TableRow({ tableHeader: true, cantSplit: true, children: pad(head).map((h, i) => cell(h, i, true)) })] : []),
      ...rows.map((row) => new TableRow({ cantSplit: true, children: pad(row).map((v, i) => cell(v, i, false)) })),
    ],
  });
}

/** Label/value pairs as a compact borderless two-column table. */
function meta(ctx: BlockCtx, items: { label: string; value: string }[]): Table {
  const widths = columnWidths(ctx, 2, [28, 72]);
  const cell = (text: string, i: number, style: RunStyle) =>
    new TableCell({ width: { size: widths[i] ?? 0, type: WidthType.DXA }, children: cellParagraphs(ctx, text, style) });
  return new Table({
    width: { size: ctx.width, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: TableBorders.NONE,
    margins: { top: 20, bottom: 20, left: 0, right: 110 },
    rows: items.map(
      (item) =>
        new TableRow({ children: [cell(item.label, 0, { bold: true, color: printPalette.ink2 }), cell(item.value, 1, {})] }),
    ),
  });
}

/**
 * The paragraph Word needs after a table or a box, kept to a hairline so it can never push onto a page of its
 * own: a table that ended at the foot of a page left a blank page after it. The space after it keeps the gap.
 */
function spacer(): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: 160, line: 20, lineRule: LineRuleType.EXACT }, children: [] });
}

function terms(ctx: BlockCtx, items: { term: string; definition: string }[]): Paragraph[] {
  return items.map(
    (item) =>
      new Paragraph({
        spacing: { after: 80 },
        children: [...runs(ctx, item.term, { bold: true }), ...runs(ctx, ` — ${item.definition}`)],
      }),
  );
}

/** A shaded callout. Word merges the identical borders of its paragraphs into one box. */
export function note(ctx: BlockCtx, label: string, text: string): Paragraph[] {
  const box = { top: hairline, bottom: hairline, left: hairline, right: hairline };
  const shading = { type: ShadingType.CLEAR, fill: printPalette.well, color: 'auto' };
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const children: ParagraphChild[] = i === 0 ? runs(ctx, `${label}  `, { bold: true }) : [];
    children.push(...runs(ctx, line));
    return new Paragraph({ border: box, shading, indent: { left: 113, right: 113 }, spacing: { after: 0 }, children });
  });
}

type Question = Extract<Block, { t: 'question' }>;

/** Ruled lines to write an answer on. */
function answerLines(count: number): Paragraph[] {
  const rule = { style: BorderStyle.SINGLE, size: 4, color: printPalette.rule, space: 1 };
  return Array.from(
    { length: count },
    () => new Paragraph({ indent: { left: 567 }, spacing: { before: 280, after: 0 }, border: { bottom: rule, between: rule }, children: [] }),
  );
}

function teacherLine(ctx: BlockCtx, label: string, text: string): Paragraph {
  const style = { color: printPalette.ink2 };
  return new Paragraph({
    indent: { left: 567 },
    spacing: { after: 60 },
    children: [...runs(ctx, `${label}: `, { ...style, bold: true }), ...runs(ctx, text, style)],
  });
}

function question(ctx: BlockCtx, q: Question): Paragraph[] {
  const out = [
    new Paragraph({
      keepNext: true,
      spacing: { before: 200, after: 80 },
      children: [...runs(ctx, `${q.n}. `, { bold: true }), ...runs(ctx, q.prompt)],
    }),
  ];
  const choices = q.choices.length || q.format !== 'truefalse' ? q.choices : [ctx.l.trueWord, ctx.l.falseWord];
  choices.forEach((choice, i) => {
    out.push(new Paragraph({ indent: { left: 567 }, spacing: { after: 40 }, keepNext: i < choices.length - 1, children: runs(ctx, `${choiceLetter(i)}. ${choice}`) }));
  });
  const openEnded = q.format === 'short' || q.format === 'numeric';
  if (q.answer === undefined && openEnded) out.push(...answerLines(q.format === 'short' ? 3 : 2));
  if (q.answer !== undefined) out.push(teacherLine(ctx, ctx.l.answer, q.answer));
  if (q.explanation) out.push(teacherLine(ctx, ctx.l.why, q.explanation));
  return out;
}

type Slide = Extract<Block, { t: 'slide' }>;

/** The Word version of a slide: a heading per slide, its bullets, and speaker notes as a note. */
function slide(ctx: BlockCtx, s: Slide): DocxChild[] {
  const out: DocxChild[] = [];
  if (s.lesson && s.lesson !== ctx.lesson) out.push(heading(ctx, 1, s.lesson));
  ctx.lesson = s.lesson;
  out.push(heading(ctx, 2, `${ctx.x.slide(s.n)} · ${s.title}`));
  if (s.bullets.length) out.push(...list(ctx, s.layout === 'question', s.bullets));
  if (s.notes) out.push(...note(ctx, ctx.l.teacherNote, s.notes));
  return out;
}

function answers(ctx: BlockCtx, title: string, items: { n: number; answer: string }[]): Paragraph[] {
  return [
    heading(ctx, 1, title),
    ...items.map(
      (item) => new Paragraph({ spacing: { after: 40 }, children: [...runs(ctx, `${item.n}. `, { bold: true }), ...runs(ctx, item.answer)] }),
    ),
  ];
}

/** Word measures a page in twentieths of a point and a picture in pixels at 96 to the inch. */
const TWIPS_PER_PIXEL = 15;
/** A tall picture stops short of a full page, so its caption stays with it. */
const MAX_HEIGHT_TO_WIDTH = 1.2;

type Image = Extract<Block, { t: 'image' }>;

/**
 * The picture at the width of the text or its own, whichever is smaller, with its caption under it. One that
 * could not be read is said in words: its caption and what it shows.
 */
function image(ctx: BlockCtx, block: Image): Paragraph[] {
  const media = ctx.images?.get(block.src);
  const type = media && wordImageType(media.type);
  const words = [block.caption, block.alt].filter(Boolean).join(': ');
  if (!media || !type || !ctx.placed) return [para(ctx, words, 'muted')];
  const column = Math.floor(ctx.width / TWIPS_PER_PIXEL);
  const scale = Math.min(1, column / media.width, (column * MAX_HEIGHT_TO_WIDTH) / media.height);
  const mark = pictureMark(ctx.placed.length);
  ctx.placed.push({ src: block.src, bytes: media.bytes, type, width: Math.round(media.width * scale), height: Math.round(media.height * scale), description: block.alt || block.caption });
  const picture = new Paragraph({ keepNext: Boolean(block.caption), spacing: { before: 120, after: 80 }, children: [new TextRun(mark)] });
  return block.caption ? [picture, para(ctx, block.caption, 'muted')] : [picture];
}

/** Word content for one semantic block. */
export function renderBlock(ctx: BlockCtx, block: Block): DocxChild[] {
  switch (block.t) {
    case 'heading':
      return [heading(ctx, block.level, block.text)];
    case 'para':
      return [para(ctx, block.text, block.tone)];
    case 'list':
      return list(ctx, block.ordered, block.items);
    case 'meta':
      return [meta(ctx, block.items), spacer()];
    case 'table':
      return [table(ctx, block.head, block.rows, block.widths), spacer()];
    case 'terms':
      return terms(ctx, block.items);
    case 'note':
      return [...note(ctx, block.label, block.text), spacer()];
    case 'image':
      return image(ctx, block);
    case 'question':
      return question(ctx, block);
    case 'slide':
      return slide(ctx, block);
    case 'answers':
      return answers(ctx, block.title, block.items);
    case 'break':
      return [new Paragraph({ children: [new PageBreak()] })];
  }
}

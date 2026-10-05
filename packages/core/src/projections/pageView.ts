import { MEDIA_FOLDER, mediaFileNames } from '../mediaNames';
import type { Lesson } from '../schema';
import type { ExhibitBlock, PageBlock } from '../page';
import type { Block } from '../semantic';
import type { Ctx } from './shared';

/** Code as the documents set it: each line in the mono face. */
const codeLines = (code: string) =>
  code
    .split('\n')
    .map((line) => (line.trim() ? `\`${line.replace(/`/g, "'")}\`` : ''))
    .join('\n');

/** The file each of the course's own clips and files is exported as, by its reference. */
type Names = ReadonlyMap<string, string>;
const NO_NAMES: Names = new Map();

/** A recording can't be set on paper: its first frame stands for it, and the words say which file it is. */
function videoView(ctx: Ctx, b: Extract<PageBlock, { type: 'video' }>, names: Names): Block[] {
  const m = ctx.l.module;
  const name = names.get(b.src);
  const said = `${b.clip ? m.clip : m.video(b.minutes)}: ${b.caption || b.shows}`;
  const text = name ? m.withFile(said, `${MEDIA_FOLDER}/${name}`) : said;
  const shown: Block = b.src && b.poster ? { t: 'image', src: b.poster, alt: b.alt, caption: text } : { t: 'para', tone: 'muted', text: b.src ? text : `${m.video(b.minutes)}: ${b.caption || b.shows}` };
  return [shown, ...(b.transcript.trim() ? [{ t: 'note' as const, label: m.transcript, text: b.transcript }] : [])];
}

type Exhibit = Extract<PageBlock, { type: 'exhibit' }>;

/** The words of an exhibit with each thing the page points at numbered where it stands: "[1]" after it, and the notes listed under the exhibit. */
function numbered(marks: Exhibit['marks']): (text: string) => string {
  const done = new Set<number>();
  return (text) =>
    marks.reduce((out, m, i) => {
      if (done.has(i) || !m.quote || !out.includes(m.quote)) return out;
      done.add(i);
      return out.replace(m.quote, () => `${m.quote} [${i + 1}]`);
    }, text);
}

function exhibitBlock(b: ExhibitBlock, mark: (text: string) => string): Block[] {
  switch (b.type) {
    case 'heading':
      return [{ t: 'para', text: `**${mark(b.text).replace(/\*/g, '')}**` }];
    case 'para':
      return [{ t: 'para', text: mark(b.text) }];
    case 'list':
      return [{ t: 'list', ordered: b.ordered, items: b.items.map(mark) }];
    case 'field':
      return [{ t: 'meta', items: [{ label: mark(b.label), value: mark(b.value) || '\u2003' }] }];
    case 'table':
      return [{ t: 'table', head: b.columns.map(mark), rows: b.rows.map((r) => r.map(mark)) }, ...(b.caption ? [{ t: 'para' as const, tone: 'muted' as const, text: b.caption }] : [])];
    case 'yours':
      return [{ t: 'para', tone: 'muted', text: b.hint || '\u2003' }];
  }
}

/** An exhibit as a document sets it: real paragraphs and a real table, what the page points at numbered, the notes under it. */
function exhibitView(ctx: Ctx, b: Exhibit): Block[] {
  const mark = numbered(b.marks);
  const parts = b.parts.flatMap((p): Block[] => [...(p.label ? [{ t: 'para' as const, text: `**${p.label.replace(/\*/g, '')}**` }] : []), ...p.blocks.flatMap((x) => exhibitBlock(x, mark))]);
  return [
    ...(b.title ? [{ t: 'para' as const, text: `**${mark(b.title).replace(/\*/g, '')}**` }] : []),
    // Held back on the page until the student opens it: on paper, said.
    ...(b.reveal ? [{ t: 'para' as const, tone: 'muted' as const, text: ctx.l.module.afterYourOwn }] : []),
    ...parts,
    ...(b.marks.length ? [{ t: 'list' as const, ordered: true, items: b.marks.map((m) => m.note) }] : []),
    ...(b.caption ? [{ t: 'para' as const, tone: 'muted' as const, text: b.caption }] : []),
  ];
}

function blockView(ctx: Ctx, b: PageBlock, names: Names): Block[] {
  const m = ctx.l.module;
  switch (b.type) {
    case 'heading':
      // Under a part's heading, which is the document's lowest level: set as a label, so a reader can tell which is inside which.
      return [{ t: 'para', text: `**${b.text.replace(/\*/g, '')}**` }];
    case 'text':
      return [{ t: 'para', text: b.text }];
    case 'list':
      return [{ t: 'list', ordered: b.ordered, items: b.items }];
    case 'steps':
      // A picture that is not on the page is said in words: what a student who can't see it reads.
      return [
        { t: 'list', ordered: true, items: b.items.map((s) => (s.shot?.alt && !s.shot.src ? `${s.text}\n(${m.picture}: ${s.shot.alt})` : s.text)) },
        ...b.items.flatMap((s, i) => (s.shot?.src ? [{ t: 'image' as const, src: s.shot.src, alt: s.shot.alt, caption: s.shot.caption || `${ctx.l.steps} ${i + 1}` }] : [])),
      ];
    case 'callout':
      return [{ t: 'note', label: b.title ? `${m.callouts[b.kind]}: ${b.title}` : m.callouts[b.kind], text: b.text }];
    case 'code':
      return [{ t: 'para', text: codeLines(b.code) }];
    case 'image':
      if (b.src) return [{ t: 'image', src: b.src, alt: b.alt, caption: b.caption }];
      return [{ t: 'para', tone: 'muted', text: `${m.picture}: ${b.alt || b.shows}${b.caption ? `\n${b.caption}` : ''}` }];
    case 'video':
      return videoView(ctx, b, names);
    case 'file': {
      // Named when it goes out under another name than the page calls it by.
      const name = names.get(b.href);
      const text = `${m.file}: ${b.label}`;
      return [{ t: 'para', tone: 'muted', text: name && name !== b.label.trim() ? m.withFile(text, `${MEDIA_FOLDER}/${name}`) : text }];
    }
    case 'exhibit':
      return exhibitView(ctx, b);
    case 'checklist':
      return [
        { t: 'heading', level: 3, text: m.thisWeek },
        { t: 'table', head: [ctx.l.activity, ctx.l.time, m.due], widths: [64, 16, 20], rows: b.items.map((i) => [i.label, ctx.l.minutes(i.minutes), i.due || ctx.l.none]) },
      ];
    case 'terms':
      return [{ t: 'terms', items: b.items.map((i) => ({ term: i.term, definition: i.meaning })) }];
  }
}

/** Blocks that belong to no week (Start here), as a document. */
export function pageBlocks(ctx: Ctx, blocks: readonly PageBlock[]): Block[] {
  return blocks.flatMap((b) => (b.type === 'heading' && b.level === 2 ? [{ t: 'heading' as const, level: 3 as const, text: b.text }] : blockView(ctx, b, NO_NAMES)));
}

/**
 * What is still to be made for a page, for whoever makes it: every empty picture, recording and file slot with where it
 * sits and what it must show. Following a sample course by hand, this list was the work: without it, slots stay empty.
 */
function toMake(ctx: Ctx, page: readonly PageBlock[]): string[] {
  const m = ctx.l.module;
  const out: string[] = [];
  let part = '';
  let step = 0;
  for (const b of page) {
    if (b.type === 'heading' && b.level === 2) [part, step] = [b.text, 0];
    if (b.type === 'steps')
      for (const item of b.items) {
        step += 1;
        if (item.shot && !item.shot.src) out.push(`${m.picture} (${m.where(part, step)}): ${item.shot.shows || item.shot.alt}`);
      }
    if (b.type === 'image' && !b.src) out.push(`${m.picture} (${m.where(part, step)}): ${b.shows || b.alt}`);
    if (b.type === 'video' && !b.src) out.push(`${b.clip ? m.clip : m.video(b.minutes)} (${m.where(part, step)}): ${b.shows || b.caption}`);
    if (b.type === 'file' && !b.href) out.push(`${m.file} (${m.where(part, step)}): ${[b.label, b.shows].filter(Boolean).join(': ')}`);
  }
  return out;
}

/** A week's module page as a document: the student's copy is the page; the teacher's adds the instructor's kit. */
export function projectPage(ctx: Ctx, lesson: Lesson): Block[] {
  const names = mediaFileNames(ctx.course);
  const blocks = lesson.page.flatMap((b) => (b.type === 'heading' && b.level === 2 ? [{ t: 'heading' as const, level: 3 as const, text: b.text }] : blockView(ctx, b, names)));
  const kit = lesson.facilitation;
  if (!ctx.teacher || !kit) return blocks;
  const m = ctx.l.module;
  const make = toMake(ctx, lesson.page);
  return [
    ...blocks,
    { t: 'heading', level: 3, text: m.kit },
    ...(kit.announcement ? [{ t: 'note' as const, label: m.announcement, text: kit.announcement }] : []),
    ...(kit.watchFor.length ? [{ t: 'note' as const, label: m.watchFor, text: kit.watchFor.map((w) => `• ${w}`).join('\n') }] : []),
    ...(kit.feedback.length ? [{ t: 'note' as const, label: m.feedback, text: kit.feedback.map((w) => `• ${w}`).join('\n') }] : []),
    ...(kit.atRisk ? [{ t: 'note' as const, label: m.atRisk, text: kit.atRisk }] : []),
    ...(kit.toCheck.length ? [{ t: 'heading' as const, level: 3 as const, text: m.toCheck }, { t: 'para' as const, tone: 'muted' as const, text: m.toCheckLead }, { t: 'list' as const, ordered: false, items: kit.toCheck }] : []),
    ...(make.length ? [{ t: 'heading' as const, level: 3 as const, text: m.toMake }, { t: 'para' as const, tone: 'muted' as const, text: m.toMakeLead }, { t: 'list' as const, ordered: true, items: make }] : []),
  ];
}

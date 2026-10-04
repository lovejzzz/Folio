import type { Lesson } from '../schema';
import type { PageBlock } from '../page';
import type { Block } from '../semantic';
import type { Ctx } from './shared';

/** Code as the documents set it: each line in the mono face. */
const codeLines = (code: string) =>
  code
    .split('\n')
    .map((line) => (line.trim() ? `\`${line.replace(/`/g, "'")}\`` : ''))
    .join('\n');

function blockView(ctx: Ctx, b: PageBlock): Block[] {
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
      return [{ t: 'para', tone: 'muted', text: `${m.video(b.minutes)}: ${b.caption || b.shows}` }, ...(b.transcript.trim() ? [{ t: 'note' as const, label: m.transcript, text: b.transcript }] : [])];
    case 'file':
      return [{ t: 'para', tone: 'muted', text: `${m.file}: ${b.label}` }];
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
  return blocks.flatMap((b) => (b.type === 'heading' && b.level === 2 ? [{ t: 'heading' as const, level: 3 as const, text: b.text }] : blockView(ctx, b)));
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
  const blocks = lesson.page.flatMap((b) => (b.type === 'heading' && b.level === 2 ? [{ t: 'heading' as const, level: 3 as const, text: b.text }] : blockView(ctx, b)));
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

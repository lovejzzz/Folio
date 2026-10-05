import { exhibitBlock } from './pageView';
import { filledTexts, isBlankPoint, isBlankSegment, isBlankTerm, statedObjectives } from '../blank';
import { lessonSessions, sessionIndex } from '../course';
import type { Handout } from '../page';
import type { Lesson } from '../schema';
import type { Block } from '../semantic';
import { projectPage } from './pageView';
import { field, lessonHeading, lessonsIn, nonEmpty, questionBlock, shownQuestions, type Ctx } from './shared';

const terms = (lesson: Lesson) => lesson.vocabulary.filter((v) => !isBlankTerm(v)).map(({ term, definition }) => ({ term, definition }));

/** Where a sheet of slips or cards is cut. */
const CUT = `\u2702 ${'- '.repeat(34)}`.trimEnd();
/** Slips to a page: a ticket is a few lines, and a page of one wastes two thirds of the paper. */
const SLIPS = 3;
/** Cards to a row, each with room to be picked up and sorted. */
const CARDS = 3;

/**
 * A sheet as paper wants it. Slips come several to a page with a line to cut along; cards come as a grid, one
 * card to a cell with space around its words, in place of a list that cannot be cut apart.
 */
function sheet(h: Handout): Block[] {
  const body = (blocks: Handout['blocks']) => blocks.flatMap((b) => exhibitBlock(b));
  if (h.kind === 'slips') return Array.from({ length: SLIPS }, (_, i): Block[] => [...(i ? [{ t: 'para' as const, tone: 'muted' as const, text: CUT }] : []), ...body(h.blocks)]).flat();
  if (h.kind !== 'cards') return body(h.blocks);
  return h.blocks.flatMap((b): Block[] => {
    if (b.type !== 'table') return exhibitBlock(b);
    // One card to a row of the sheet's table: its cells, without a column that only numbers the cards.
    const cards = b.rows.map((r) => r.filter((c, i) => c.trim() && !(i === 0 && r.length > 1 && /^\d+\.?$/.test(c.trim()))).join('\n')).filter(Boolean);
    const rows = Array.from({ length: Math.ceil(cards.length / CARDS) }, (_, i) => Array.from({ length: CARDS }, (_, j) => (cards[i * CARDS + j] ? `\n${cards[i * CARDS + j]}\n` : '')));
    return [{ t: 'table', head: [], rows }];
  });
}

/** Lesson plans. The student copy is a lesson outline without teacher notes. */
export function projectPlan(ctx: Ctx): Block[] {
  const { course, l, teacher } = ctx;
  const blocks: Block[] = [];
  for (const lesson of lessonsIn(ctx)) {
    blocks.push(lessonHeading(ctx, lesson));
    if (lesson.standards.length) blocks.push({ t: 'meta', items: [{ label: l.standards, value: lesson.standards.join(', ') }] });
    if (nonEmpty(lesson.summary)) blocks.push({ t: 'para', text: lesson.summary, tone: 'lead' });
    const objectives = statedObjectives(course, lesson);
    if (objectives.length) {
      blocks.push({ t: 'heading', level: 3, text: l.objectives });
      blocks.push({ t: 'list', ordered: false, items: objectives.map((o) => o.text) });
    }
    const readings = filledTexts(lesson.readings);
    if (readings.length) {
      blocks.push({ t: 'heading', level: 3, text: l.beforeClass });
      blocks.push({ t: 'list', ordered: false, items: readings });
    }
    const keyIdeas = filledTexts(lesson.keyIdeas);
    if (keyIdeas.length) {
      blocks.push({ t: 'heading', level: 3, text: l.keyIdeas });
      blocks.push({ t: 'list', ordered: false, items: keyIdeas });
    }
    if (lesson.page.length) blocks.push(...projectPage(ctx, lesson));
    const segments = lesson.segments.filter((s) => !isBlankSegment(s));
    const sessions = lessonSessions(course);
    // A lesson that meets more than once gets a table per session, under its name and length.
    for (const [i, session] of sessions.entries()) {
      const mine = segments.filter((s) => sessionIndex(course, s.session) === i);
      if (!mine.length) continue;
      if (sessions.length > 1) blocks.push({ t: 'heading', level: 3, text: l.sessionHeading(l.sessionKinds[session.kind], session.minutes) });
      blocks.push({
        t: 'table',
        head: [l.time, l.activity, l.details],
        widths: [12, 28, 60],
        rows: mine.map((s) => [
          l.minutes(s.minutes),
          field(ctx, s.id, 'title', s.title),
          teacher && s.teacherNotes ? `${s.description}\n${l.teacherNote}: ${s.teacherNotes}` : s.description,
        ]),
      });
    }
    const vocabulary = terms(lesson);
    if (vocabulary.length) {
      blocks.push({ t: 'heading', level: 3, text: l.vocabulary });
      blocks.push({ t: 'terms', items: vocabulary });
    }
    // Each sheet on a page of its own, ready to copy; its answers follow it in the teacher's copy only.
    for (const h of lesson.handouts) {
      blocks.push({ t: 'break' }, { t: 'heading', level: 3, text: h.title });
      if (teacher && (h.copies || h.usedIn || h.supports)) blocks.push({ t: 'para', tone: 'muted', text: [h.supports && l.withSupports, h.copies, h.usedIn && l.usedIn(h.usedIn)].filter(Boolean).join(' · ') });
      blocks.push(...sheet(h));
      if (teacher && h.key.trim()) blocks.push({ t: 'note', label: l.answerKey, text: h.key });
    }
    blocks.push({ t: 'break' });
  }
  return trimBreak(blocks);
}

export function projectSlides(ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  let n = 0;
  for (const lesson of lessonsIn(ctx)) {
    const lessonLabel = ctx.l.lesson(ctx.course.lessonOrder.indexOf(lesson.id) + 1);
    for (const slide of lesson.slides) {
      n += 1;
      blocks.push({
        t: 'slide',
        n,
        layout: slide.layout,
        title: field(ctx, slide.id, 'title', slide.title),
        bullets: filledTexts(slide.bullets),
        lesson: `${lessonLabel} · ${lesson.title}`,
        ...(ctx.teacher && slide.notes ? { notes: slide.notes } : {}),
        ...(slide.visual ? { visual: slide.visual } : {}),
      });
    }
  }
  return blocks;
}

/** Study guides: overview, explanations, vocabulary, and a short self-check. */
export function projectStudy(ctx: Ctx): Block[] {
  const { course, l } = ctx;
  const blocks: Block[] = [];
  for (const lesson of lessonsIn(ctx)) {
    blocks.push(lessonHeading(ctx, lesson));
    if (nonEmpty(lesson.study.overview)) blocks.push({ t: 'para', text: lesson.study.overview, tone: 'lead' });
    for (const point of lesson.study.points.filter((x) => !isBlankPoint(x))) {
      blocks.push({ t: 'heading', level: 3, text: point.heading });
      blocks.push({ t: 'para', text: point.explanation });
    }
    const vocabulary = terms(lesson);
    if (vocabulary.length) {
      blocks.push({ t: 'heading', level: 3, text: l.vocabulary });
      blocks.push({ t: 'terms', items: vocabulary });
    }
    const check = shownQuestions(course, lesson).slice(0, 3);
    if (check.length) {
      blocks.push({ t: 'heading', level: 3, text: l.checkYourself });
      check.forEach((q, i) => blocks.push(questionBlock(ctx, q, i + 1)));
    }
    blocks.push({ t: 'break' });
  }
  return trimBreak(blocks);
}

export function trimBreak(blocks: Block[]): Block[] {
  return blocks.at(-1)?.t === 'break' ? blocks.slice(0, -1) : blocks;
}

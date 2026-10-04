import { cmd, newId, sessionIndex, type Command, type Course, type Flag, type Lesson, type PageBlock } from '@folio/core';
import type { Inference } from './inference';
import { mendModule, mendPlan, type Left } from './mend';
import { BlockDraft, ModuleDraft, WRAP_UP, pageBlocks } from './online';
import type { PlanDraft } from './schemas';
import { typesetDraft } from './typeset';

/**
 * A note the build left on a plan, put right at the teacher's word. The build mends what it can; what stays is
 * the teacher's to decide, or would not come right. Either way they should not have to rewrite the page by hand:
 * they say what they have decided, or nothing, and the parts at fault are written again.
 */

type ReviewNote = Extract<Flag, { code: 'reviewNote' }>;

export interface NoteFix {
  /** Empty when nothing was changed. */
  commands: Command[];
  /** Why the writer left a note as it was: a question for the teacher, or what shows the page is right. */
  left: Left[];
}

type Block = ModuleDraft['parts'][number]['blocks'][number];

/** A block of a saved page, as the writer first gave it: the form a mend reads and writes. */
function blockDraft(b: PageBlock): Block | null {
  const d = (fields: Partial<Block> & Pick<Block, 'type'>): Block => BlockDraft.parse(fields);
  switch (b.type) {
    case 'heading':
    case 'text':
      return d({ type: b.type, text: b.text });
    case 'list':
      return d({ type: 'list', items: b.items });
    case 'steps':
      return d({ type: 'steps', items: b.items.map((s) => s.text), shots: b.items.flatMap((s, i) => (s.shot ? [{ step: i + 1, shows: s.shot.shows || s.shot.alt || s.shot.caption || '-', alt: s.shot.alt || s.shot.shows || '-', caption: s.shot.caption }] : [])) });
    case 'callout':
      return d({ type: 'callout', kind: b.kind, title: b.title, text: b.text });
    case 'code':
      return d({ type: 'code', kind: b.language, title: b.caption, text: b.code });
    case 'image':
      return d({ type: 'image', text: b.caption, alt: b.alt, shows: b.shows });
    case 'video':
      return d({ type: 'video', kind: b.clip ? 'clip' : 'talk', text: b.caption, alt: b.alt, shows: b.shows, minutes: b.minutes, transcript: b.transcript });
    case 'file':
      return d({ type: 'file', kind: b.role, text: b.label, shows: b.shows });
    case 'terms':
      return d({ type: 'terms', items: b.items.map((t) => `${t.term}: ${t.meaning}`) });
    case 'checklist':
      return null;
  }
}

interface Part {
  heading: Extract<PageBlock, { type: 'heading' }>;
  blocks: PageBlock[];
}

/** A saved page taken apart as it was put together: the introduction, the checklist, each part, the wrap-up. */
function takeApart(page: readonly PageBlock[], language: string): { lead: PageBlock[]; parts: Part[]; wrap: Part | null } {
  const lead: PageBlock[] = [];
  const parts: Part[] = [];
  for (const block of page) {
    if (block.type === 'heading' && block.level === 2) parts.push({ heading: block, blocks: [] });
    else (parts.at(-1)?.blocks ?? lead).push(block);
  }
  const last = parts.at(-1);
  const wrap = last && last.heading.text === (WRAP_UP[language] ?? WRAP_UP.en) ? parts.pop()! : null;
  return { lead, parts, wrap };
}

const textOf = (blocks: readonly PageBlock[]) => blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n\n');

/** The week's page as a draft a mend can work on. */
export function pageDraft(lesson: Lesson, language: string): ModuleDraft {
  const { lead, parts, wrap } = takeApart(lesson.page, language);
  const checklist = lead.find((b) => b.type === 'checklist');
  const kit = lesson.facilitation ?? { announcement: '', watchFor: [], feedback: [], atRisk: '', leaves: [], toCheck: [] };
  return {
    keyIdeas: lesson.keyIdeas,
    intro: textOf(lead),
    checklist: checklist?.type === 'checklist' ? checklist.items.map(({ label, activity, minutes, due }) => ({ label, activity, minutes, due })) : [],
    parts: parts.map((p) => ({ title: p.heading.text, blocks: p.blocks.flatMap((b) => blockDraft(b) ?? []) })),
    live: lesson.segments.map(({ kind, title, minutes, description, teacherNotes }) => ({ kind, title, minutes, description, teacherNotes })),
    wrapUp: wrap ? textOf(wrap.blocks) : '',
    vocabulary: lesson.vocabulary.map(({ term, definition }) => ({ term, definition })),
    facilitation: kit,
  };
}

/** What a picture, clip or file was asked to show, and the media already made for it. */
function made(blocks: readonly PageBlock[]): Map<string, { src: string; poster?: string }> {
  const out = new Map<string, { src: string; poster?: string }>();
  for (const b of blocks) {
    if (b.type === 'image' && b.src) out.set(`image:${b.shows}`, { src: b.src });
    if (b.type === 'video' && b.src) out.set(`video:${b.shows}`, { src: b.src, poster: b.poster });
    if (b.type === 'file' && b.href) out.set(`file:${b.label}`, { src: b.href });
    if (b.type === 'steps') for (const s of b.items) if (s.shot?.src) out.set(`image:${s.shot.shows}`, { src: s.shot.src });
  }
  return out;
}

/** A part written again keeps the pictures, clips and files the teacher made for it, wherever it still asks for the same thing. */
function keepMedia(blocks: PageBlock[], old: readonly PageBlock[]): PageBlock[] {
  const have = made(old);
  return blocks.map((b): PageBlock => {
    if (b.type === 'image') return { ...b, src: have.get(`image:${b.shows}`)?.src ?? '' };
    if (b.type === 'video') return { ...b, src: have.get(`video:${b.shows}`)?.src ?? '', poster: have.get(`video:${b.shows}`)?.poster ?? '' };
    if (b.type === 'file') return { ...b, href: have.get(`file:${b.label}`)?.src ?? '' };
    if (b.type === 'steps') return { ...b, items: b.items.map((s) => (s.shot ? { ...s, shot: { ...s.shot, src: have.get(`image:${s.shot.shows}`)?.src ?? '' } } : s)) };
    return b;
  });
}

/** The saved page with a mend's changes made: parts that did not change keep their blocks, ids and media as they are. */
function mendedPage(lesson: Lesson, language: string, before: ModuleDraft, after: ModuleDraft): PageBlock[] {
  const { lead, parts, wrap } = takeApart(lesson.page, language);
  const text = (blocks: PageBlock[], was: string, now: string): PageBlock[] => (now === was ? blocks : [{ id: blocks.find((b) => b.type === 'text')?.id ?? newId('x'), type: 'text', text: now }]);
  const head = lead.filter((b) => b.type !== 'checklist' && b.type !== 'text');
  const list = lead.find((b) => b.type === 'checklist');
  const checklist: PageBlock[] = after.checklist === before.checklist ? (list ? [list] : []) : [{ id: list?.id ?? newId('x'), type: 'checklist', items: after.checklist.map((c) => ({ id: newId('x'), ...c })) }];
  const body = parts.flatMap((p, i): PageBlock[] => {
    const now = after.parts[i]!;
    if (now === before.parts[i]) return [p.heading, ...p.blocks];
    return [{ ...p.heading, text: now.title }, ...keepMedia(now.blocks.flatMap(pageBlocks), p.blocks)];
  });
  return [...text(lead.filter((b) => b.type === 'text'), before.intro, after.intro), ...checklist, ...head, ...body, ...(wrap ? [wrap.heading, ...text(wrap.blocks, before.wrapUp, after.wrapUp)] : [])];
}

/** The lesson plan as a draft a mend can work on. */
function planDraft(lesson: Lesson): PlanDraft {
  return {
    keyIdeas: lesson.keyIdeas,
    segments: lesson.segments.map(({ kind, session, title, minutes, description, teacherNotes }) => ({ kind, session: session + 1, title, minutes, description, teacherNotes })),
    vocabulary: lesson.vocabulary.map(({ term, definition }) => ({ term, definition })),
  };
}

const asked = (notes: ReviewNote[], answer: string): ReviewNote[] => (answer.trim() ? notes.map((n) => ({ ...n, values: { ...n.values, text: `${n.values.text} The teacher has decided: ${answer.trim()}` } })) : notes);

/**
 * Put right the notes given, on a plan already in the course. `keep` is what stays flagged afterwards: the
 * section's other notes. With an answer, a note that waited on the teacher's decision is fixed as they decided.
 */
export async function fixNotes(inference: Inference, course: Course, lessonId: string, notes: ReviewNote[], keep: Flag[], answer = '', signal?: AbortSignal): Promise<NoteFix> {
  const lesson = course.lessons[lessonId];
  if (!lesson) throw new Error(`No lesson ${lessonId}`);
  const fill = (content: { keyIdeas: string[]; segments: Lesson['segments']; vocabulary: Lesson['vocabulary']; page?: PageBlock[]; facilitation?: Lesson['facilitation'] }, flags: Flag[]): Command[] => [cmd('section.fill', { lessonId, kind: 'plan', flags, content })];
  if (lesson.page.length) {
    const before = pageDraft(lesson, course.language);
    const mended = await mendModule(inference, course, lesson, before, asked(notes, answer), signal);
    if (!mended.changed.length) return { commands: [], left: mended.left };
    const set = typesetDraft(mended.value, course.language);
    // What was not written again stays the very object it was, so the page keeps those blocks as they are.
    const after = { ...set, parts: set.parts.map((p, i) => (mended.value.parts[i] === before.parts[i] ? before.parts[i]! : p)), checklist: mended.value.checklist === before.checklist ? before.checklist : set.checklist };
    // The live session's run of show keeps its segments' ids where it was not written again.
    const segments = mended.value.live === before.live ? lesson.segments : set.live.map((s) => ({ ...s, id: newId('x'), session: 0 }));
    const content = { keyIdeas: lesson.keyIdeas, segments, vocabulary: lesson.vocabulary, page: mendedPage(lesson, course.language, before, after), facilitation: mended.value.facilitation };
    return { commands: fill(content, leftFlags(keep, notes, mended.left)), left: mended.left };
  }
  const before = planDraft(lesson);
  const mended = await mendPlan(inference, course, lesson, before, asked(notes, answer), signal);
  if (!mended.changed.length) return { commands: [], left: mended.left };
  const after = typesetDraft(mended.value, course.language);
  const segments = after.segments.map((s, i) => (mended.value.segments[i] === before.segments[i] ? lesson.segments[i]! : { ...s, session: sessionIndex(course, s.session - 1), id: lesson.segments[i]?.id ?? newId('x') }));
  const vocabulary = mended.value.vocabulary === before.vocabulary ? lesson.vocabulary : after.vocabulary.map((t) => ({ ...t, id: newId('x') }));
  return { commands: fill({ keyIdeas: after.keyIdeas, segments, vocabulary }, leftFlags(keep, notes, mended.left)), left: mended.left };
}

/** The flags that stay: the section's others, and any of these the writer did not fix. */
function leftFlags(keep: Flag[], notes: ReviewNote[], left: Left[]): Flag[] {
  return [...keep, ...left.flatMap((l) => (notes[l.note - 1] ? [notes[l.note - 1]!] : []))];
}

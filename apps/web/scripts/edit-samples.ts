// The last pass on a sample course: a teacher's edits after reading it through, kept in
// scripts/sample-edits/<name>.json so the published sample can be rebuilt from what Folio wrote.
//   pnpm --filter @folio/web exec tsx scripts/edit-samples.ts [--from <dir of the courses as generated>] [names ...]
// Edits match the course as Folio wrote it, so keep that copy: with --from the sample is rebuilt from it.
// Each edit replaces exact words, within one lesson (its plan, slides, study guide, tasks, rubrics and answers
// to questions) or, with no lesson given, anywhere in the course. An edit that finds nothing, or finds its words
// more than once without "all", stops the run: the course has changed under it. Afterwards every section is
// stamped as written from the course as it now stands, so a teacher's corrections don't mark it out of date.
import { computeBasis, orderedLessons, parseCourse, type Course, type PageBlock } from '@folio/core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAMPLE_NAMES, type SampleName } from '../src/lib/samples';

const WEB = new URL('..', import.meta.url).pathname;

interface Edit {
  /** The lesson's number, from 1; none for the whole course. */
  lesson?: number;
  find?: string;
  replace?: string;
  /** Instead of a replacement: settle the plan review's note whose place contains these words, once fixed or judged wrong. */
  settle?: string;
  /** Instead of a replacement: rename every rubric's levels and set their points, as { "A": ["Exemplary", 4] }. */
  relabel?: Record<string, [string, number]>;
  /**
   * Instead of a replacement, in an online course's page: fill the nth picture, clip or file of the lesson (counted
   * from 1 in page order, pictures under steps included) with the media made for it, or take the slot away with
   * "drop" when it cannot be made (a screen of another operating system).
   */
  slot?: number;
  src?: string;
  poster?: string;
  caption?: string;
  drop?: boolean;
  /** Instead of a replacement: the caption or alt text of the picture or clip already placed whose file has this name. */
  media?: string;
  alt?: string;
  /** Replace every occurrence, not just the one. */
  all?: boolean;
  /** Why, for whoever reads the file later. */
  why?: string;
}

/** The parts of the course an edit may touch. */
function scope(course: Course, lesson: number | undefined): object[] {
  if (lesson === undefined) return [course];
  const l = orderedLessons(course)[lesson - 1];
  if (!l) throw new Error(`no lesson ${lesson}`);
  const tasks = l.taskIds.map((id) => course.tasks[id]).filter((t) => t !== undefined);
  const rubrics = tasks.flatMap((t) => (t.kind === 'assignment' && t.rubricId ? [course.rubrics[t.rubricId]] : [])).filter((r) => r !== undefined);
  const faq = Object.values(course.faq).filter((f) => f.lessonId === l.id);
  return [l, ...tasks, ...rubrics, ...faq];
}

/** Count, or make, the replacements in every string under a value. */
function walk(value: unknown, edit: Edit, apply: boolean): number {
  if (Array.isArray(value)) return (value as unknown[]).reduce((n: number, item, i) => n + visit(value as unknown as Record<number, unknown>, i, item, edit, apply), 0);
  if (value && typeof value === 'object') return Object.entries(value).reduce((n, [k, v]) => n + visit(value as Record<string, unknown>, k, v, edit, apply), 0);
  return 0;
}

function visit(parent: Record<string | number, unknown>, key: string | number, value: unknown, edit: Edit, apply: boolean): number {
  // Ids and stamps are never prose.
  if (key === 'id' || key === 'gen' || key === 'basis') return 0;
  if (typeof value !== 'string') return walk(value, edit, apply);
  const count = value.split(edit.find!).length - 1;
  if (apply && count) parent[key] = value.split(edit.find!).join(edit.replace!);
  return count;
}

function settle(course: Course, lesson: number | undefined, where: string, name: string): void {
  const plan = orderedLessons(course)[(lesson ?? 0) - 1]?.gen.plan;
  const before = plan?.flags.length ?? 0;
  // "*" settles every note and check on the page at once: used once a page has been followed and corrected by hand.
  if (plan && where === '*') return void (plan.flags = []);
  if (plan) plan.flags = plan.flags.filter((f) => !(f.code === 'reviewNote' && f.values.where.includes(where)));
  if (!plan || plan.flags.length !== before - 1) throw new Error(`${name}: lesson ${lesson} has no single note at "${where}"`);
}

/** One place for a picture, clip or file on a page: how to fill it, and how to take it away. */
interface Slot {
  fill: (src: string, poster?: string, caption?: string) => void;
  drop: () => void;
}

/** A lesson page's media slots, in page order. Dropping one leaves the others' numbers as they were for this run. */
function slots(page: PageBlock[]): Slot[] {
  const gone = new Set<string>();
  const out: Slot[] = [];
  for (const block of page) {
    // A picture slot filled with a recording becomes a clip: what the page asked to show turned out to move.
    if (block.type === 'image' || block.type === 'video')
      out.push({
        fill: (src, poster, caption) => Object.assign(block, { src }, caption ? { caption } : {}, src.endsWith('.mp4') ? { type: 'video', poster: poster ?? '', clip: true, minutes: 0.2, transcript: '', ...(block.type === 'video' ? { minutes: block.minutes, transcript: block.transcript, clip: block.clip } : {}) } : {}),
        drop: () => void gone.add(block.id),
      });
    // A file the page left unnamed takes its name from the edit's caption.
    if (block.type === 'file') out.push({ fill: (src, _poster, caption) => void Object.assign(block, { href: src }, caption && !block.label.trim() ? { label: caption } : {}), drop: () => void gone.add(block.id) });
    if (block.type === 'steps') for (const step of block.items) if (step.shot) out.push({ fill: (src, _poster, caption) => void Object.assign(step.shot!, { src }, caption ? { caption } : {}), drop: () => void delete step.shot });
  }
  // Removal happens at the end, so numbers stay stable while edits are applied.
  out.push({ fill: () => {}, drop: () => void page.splice(0, page.length, ...page.filter((b) => !gone.has(b.id))) });
  return out;
}

function editOne(name: SampleName): void {
  const file = join(WEB, 'scripts/sample-edits', `${name}.json`);
  if (!existsSync(file)) return;
  const path = join(WEB, 'public/samples', `${name}.json`);
  const course = parseCourse(JSON.parse(readFileSync(FROM ? join(FROM, `${name}.json`) : path, 'utf8')));
  const edits = JSON.parse(readFileSync(file, 'utf8')) as Edit[];
  const media = new Map<number, Slot[]>();
  const slotsOf = (lesson: number) => media.get(lesson) ?? media.set(lesson, slots(orderedLessons(course)[lesson - 1]!.page)).get(lesson)!;
  for (const edit of edits) {
    if (edit.slot !== undefined) {
      const all = slotsOf(edit.lesson!);
      const slot = all[edit.slot - 1];
      if (!slot || edit.slot >= all.length) throw new Error(`${name}: lesson ${edit.lesson} has no media slot ${edit.slot}`);
      if (edit.drop) slot.drop();
      else slot.fill(edit.src!, edit.poster, edit.caption);
      continue;
    }
    if (edit.media !== undefined) {
      const page = orderedLessons(course)[edit.lesson! - 1]!.page;
      const placed = page.flatMap((b) => (b.type === 'image' || b.type === 'video' ? [b] : b.type === 'steps' ? b.items.flatMap((x) => (x.shot ? [x.shot] : [])) : [])).filter((m) => m.src.endsWith(`/${edit.media}`));
      if (placed.length !== 1) throw new Error(`${name}: lesson ${edit.lesson} has ${placed.length} pictures named ${edit.media}`);
      Object.assign(placed[0]!, edit.caption !== undefined ? { caption: edit.caption } : {}, edit.alt !== undefined ? { alt: edit.alt } : {});
      continue;
    }
    if (edit.settle !== undefined) {
      settle(course, edit.lesson, edit.settle, name);
      continue;
    }
    if (edit.relabel) {
      for (const rubric of Object.values(course.rubrics)) for (const level of rubric.levels) [level.label, level.points] = edit.relabel[level.label] ?? [level.label, level.points];
      continue;
    }
    const parts = scope(course, edit.lesson);
    const found = parts.reduce((n, part) => n + walk(part, edit, false), 0);
    if (found === 0 || (found > 1 && !edit.all)) throw new Error(`${name}: "${edit.find!.slice(0, 60)}" found ${found} times${edit.lesson ? ` in lesson ${edit.lesson}` : ''}`);
    for (const part of parts) walk(part, edit, true);
  }
  for (const all of media.values()) all.at(-1)!.drop();
  const edited = parseCourse(course);
  for (const lesson of orderedLessons(edited))
    for (const [kind, meta] of Object.entries(lesson.gen)) if (meta) meta.basis = computeBasis(edited, lesson, kind as keyof typeof lesson.gen);
  writeFileSync(path, JSON.stringify(edited));
  console.log(`${name}: ${edits.length} edits`);
}

const ARGS = process.argv.slice(2);
const FROM = ARGS.includes('--from') ? ARGS[ARGS.indexOf('--from') + 1] : undefined;
const given = ARGS.filter((a, i) => a !== '--from' && ARGS[i - 1] !== '--from');
const names = (given.length ? given : SAMPLE_NAMES) as SampleName[];
for (const name of names) editOne(name);

// The last pass on a sample course: a teacher's edits after reading it through, kept in
// scripts/sample-edits/<name>.json so the published sample can be rebuilt from what Folio wrote.
//   pnpm --filter @folio/web exec tsx scripts/edit-samples.ts [elementary|middle|university ...]
// Each edit replaces exact words, within one lesson (its plan, slides, study guide, tasks, rubrics and answers
// to questions) or, with no lesson given, anywhere in the course. An edit that finds nothing, or finds its words
// more than once without "all", stops the run: the course has changed under it. Afterwards every section is
// stamped as written from the course as it now stands, so a teacher's corrections don't mark it out of date.
import { computeBasis, orderedLessons, parseCourse, type Course } from '@folio/core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SampleName } from '../src/lib/samples';

const WEB = new URL('..', import.meta.url).pathname;

interface Edit {
  /** The lesson's number, from 1; none for the whole course. */
  lesson?: number;
  find?: string;
  replace?: string;
  /** Instead of a replacement: settle the plan review's note whose place contains these words, once fixed or judged wrong. */
  settle?: string;
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
  if (plan) plan.flags = plan.flags.filter((f) => !(f.code === 'reviewNote' && f.values.where.includes(where)));
  if (!plan || plan.flags.length !== before - 1) throw new Error(`${name}: lesson ${lesson} has no single note at "${where}"`);
}

function editOne(name: SampleName): void {
  const file = join(WEB, 'scripts/sample-edits', `${name}.json`);
  if (!existsSync(file)) return;
  const path = join(WEB, 'public/samples', `${name}.json`);
  const course = parseCourse(JSON.parse(readFileSync(path, 'utf8')));
  const edits = JSON.parse(readFileSync(file, 'utf8')) as Edit[];
  for (const edit of edits) {
    if (edit.settle !== undefined) {
      settle(course, edit.lesson, edit.settle, name);
      continue;
    }
    const parts = scope(course, edit.lesson);
    const found = parts.reduce((n, part) => n + walk(part, edit, false), 0);
    if (found === 0 || (found > 1 && !edit.all)) throw new Error(`${name}: "${edit.find!.slice(0, 60)}" found ${found} times${edit.lesson ? ` in lesson ${edit.lesson}` : ''}`);
    for (const part of parts) walk(part, edit, true);
  }
  const edited = parseCourse(course);
  for (const lesson of orderedLessons(edited))
    for (const [kind, meta] of Object.entries(lesson.gen)) if (meta) meta.basis = computeBasis(edited, lesson, kind as keyof typeof lesson.gen);
  writeFileSync(path, JSON.stringify(edited));
  console.log(`${name}: ${edits.length} edits`);
}

const names = (process.argv.slice(2).length ? process.argv.slice(2) : ['elementary', 'middle', 'university']) as SampleName[];
for (const name of names) editOne(name);

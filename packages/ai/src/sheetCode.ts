import { orderedLessons, type Course, type Handout, type Lesson, type Task } from '@folio/core';
import { z } from 'zod';
import type { Inference } from './inference';
import { runJob } from './jobs';

/**
 * The R a lesson gives students, run as they will run it: sheet by sheet and line by line, each sheet in a new
 * session, in a folder that holds what earlier lessons made. Python on a page is run before its review; R on a
 * sheet never was, and readers found what a run shows at once: a first line that changes to a folder no student
 * has, a table used that nobody loaded, a lab that stops on its second command.
 */

/** What runs the lines: R on the command line here, nothing where R cannot be had. */
export interface LineRunner {
  fresh(): Promise<void>;
  run(line: string): Promise<string | null>;
  need(packages: string[]): Promise<void>;
}

export interface CodeUnit {
  kind: 'notes' | 'handout' | 'assignment';
  title: string;
  lines: string[];
}

export interface CodeFault {
  kind: 'handout' | 'assignment';
  title: string;
  line: string;
  error: string;
}

/** A line that is code and nothing else: `x <- 1` alone between backticks. */
const whole = (text: string): string | null => /^\s*`([^`]+)`\s*$/.exec(text)?.[1] ?? null;
const inline = (text: string): string[] => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);

function sheetLines(h: Handout): string[] {
  const rows = h.blocks.flatMap((b): string[] => (b.type === 'list' ? b.items : 'text' in b && typeof b.text === 'string' ? b.text.split('\n') : []));
  return rows.map(whole).filter((l): l is string => Boolean(l?.trim()));
}

/** The code of one lesson in the order it is met: what the teacher prepares, each sheet, each piece of work. */
export function codeUnits(course: Course, lesson: Lesson): CodeUnit[] {
  // The teacher's own folder is theirs: only what makes or loads something is run from the notes.
  const notes = lesson.segments.flatMap((s) => inline(s.teacherNotes)).filter((l) => /<-|\w\(.+\)/.test(l) && !/^setwd\(/.test(l));
  const work = lesson.taskIds.map((id) => course.tasks[id]).filter((t): t is Extract<Task, { kind: 'assignment' }> => t?.kind === 'assignment');
  return [
    { kind: 'notes' as const, title: '', lines: notes },
    ...lesson.handouts.map((h) => ({ kind: 'handout' as const, title: h.title, lines: sheetLines(h) })),
    ...work.map((t) => ({ kind: 'assignment' as const, title: t.title, lines: t.steps.flatMap((s) => s.split('\n')).map(whole).filter((l): l is string => Boolean(l?.trim())) })),
  ].filter((u) => u.lines.length);
}

/** R by its marks: an arrow, a library, a column by `$`. A course in another language is left alone. */
export const looksLikeR = (units: CodeUnit[]): boolean => units.some((u) => u.kind !== 'notes' && u.lines.some((l) => /<-|\blibrary\(|\w\$\w/.test(l)));

/** A line a student completes, or one that waits for a person: it cannot be run, and is no fault. */
const SKIPPED = /\.\.\.|___|<[a-z][a-z ]*>|^\s*(?:install\.packages|View|file\.choose|readline|edit|fix|help|vignette|q|quit)\(|^\s*\?/i;

async function runUnit(runner: LineRunner, unit: CodeUnit): Promise<{ line: string; error: string }[]> {
  await runner.fresh();
  await runner.need(unit.lines.flatMap((l) => [...l.matchAll(/\b(?:library|require)\(\s*["']?([\w.]+)/g)].map((m) => m[1]!)));
  const faults: { line: string; error: string }[] = [];
  // What a skipped line would have made is missing for the lines after it: that is the template's doing, not a fault.
  const unmade = new Set<string>();
  for (const line of unit.lines) {
    if (SKIPPED.test(line)) {
      const name = /^\s*([\w.]+)\s*(?:<-|=)/.exec(line)?.[1];
      if (name) unmade.add(name);
      continue;
    }
    const error = await runner.run(line);
    if (!error) continue;
    const missing = /object '([^']+)' not found/.exec(error)?.[1];
    if (missing && unmade.has(missing)) continue;
    faults.push({ line, error });
    // One fault a sheet is enough to act on: what follows a stopped line mostly fails because of it.
    if (faults.length >= 3) break;
  }
  return faults;
}

/**
 * The faults in what this lesson gives students. The lessons before it are run first, silently: the file a
 * teacher made in week 1 is the file week 2 reads.
 */
export async function lessonCodeFaults(runner: LineRunner, course: Course, lesson: Lesson): Promise<CodeFault[]> {
  const mine = codeUnits(course, lesson);
  if (!looksLikeR(mine)) return [];
  const before = orderedLessons(course).slice(0, course.lessonOrder.indexOf(lesson.id));
  for (const unit of before.flatMap((l) => codeUnits(course, l))) await runUnit(runner, unit);
  const faults: CodeFault[] = [];
  for (const unit of mine) {
    const found = await runUnit(runner, unit);
    if (unit.kind !== 'notes') faults.push(...found.map((f) => ({ kind: unit.kind as 'handout' | 'assignment', title: unit.title, ...f })));
  }
  return faults;
}

export const CodeFix = z.object({
  changes: z
    .array(z.object({ find: z.string().min(1).describe('The exact text at fault, copied character for character, where it stands only once'), replace: z.string().describe('What stands in its place') }))
    .max(8)
    .default([]),
  meant: z.array(z.string()).max(12).default([]).describe('Lines that stopped which the material gives students as broken on purpose, to find and fix: copied exactly, and left unchanged'),
});

const ASK = [
  'The R below is given to students on a sheet or in a piece of work. It was run line by line in a new R session, in the working folder the course set, holding the files earlier lessons made; some lines stopped, with the messages shown.',
  'Give the changes of text that make every line run as a student will run it: load or create what the line uses, name no folder of anyone\'s machine, correct a call that R refuses. Change as little as possible, and nothing that ran. A line the material itself presents as faulty, for students to find the mistake in or repair, is meant to stop: change nothing in it, and list it under "meant". A change replaces text exactly as it stands in the material, backticks included where they are part of it.',
].join(' ');

/** The words to change so the lines run, or none. */
export async function codeFix(inference: Inference, material: string, faults: CodeFault[], signal?: AbortSignal): Promise<z.infer<typeof CodeFix>> {
  const told = faults.map((f) => `- ${f.kind === 'handout' ? 'Sheet' : 'Work'} "${f.title}": \`${f.line}\` stopped with: ${f.error}`).join('\n');
  const result = await runJob(inference, { task: 'folio_answer_fix', system: 'You correct course materials. Reply with one JSON object and nothing else.', prompt: `${ASK}\n\nThe lines that stopped:\n${told}\n\nThe material:\n${material}`, effort: 'low', schema: CodeFix, repair: false, signal });
  return result.value;
}

/** A note for the teacher on a line that still stops. */
export const faultNote = (f: CodeFault): string => `In "${f.title}", the line \`${f.line}\` stops when run in a new R session: ${f.error}`;

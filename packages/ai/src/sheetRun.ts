import type { Course, Flag, Handout, Lesson, Task } from '@folio/core';
import type { Inference } from './inference';
import { codeFix, faultNote, lessonCodeFaults, type CodeFault, type LineRunner } from './sheetCode';

/**
 * A lesson's sheets and its work, put right by running them. Lines that stop are sent once to be corrected, the
 * correction is kept only when fewer lines then stop, and what still stops is said to the teacher with R's own
 * message. A run that cannot be had costs the lesson nothing.
 */

/** One R, many lessons written at once: each run has the session to itself. */
const queues = new WeakMap<object, Promise<unknown>>();
function alone<T>(runner: LineRunner, job: () => Promise<T>): Promise<T> {
  const next = (queues.get(runner) ?? Promise.resolve()).then(job, job);
  queues.set(runner, next.catch(() => undefined));
  return next;
}

type Material<T> = { value: T; faults: CodeFault[] };

/** Every string of the material with the change made, when its text stands in exactly one string once. */
function changed<T>(value: T, find: string, replace: string): T | null {
  let hits = 0;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const n = v.split(find).length - 1;
      hits += n;
      return n ? v.split(find).join(replace) : v;
    }
    if (Array.isArray(v)) return v.map(walk);
    return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
  };
  const out = walk(value) as T;
  return hits === 1 ? out : null;
}

async function mended<T>(inference: Inference, first: Material<T>, shown: (value: T) => string, check: (value: T) => Promise<CodeFault[]>, signal?: AbortSignal): Promise<Material<T>> {
  if (!first.faults.length) return first;
  const changes = await codeFix(inference, shown(first.value), first.faults, signal).catch(() => []);
  const value = changes.reduce<T>((now, c) => changed(now, c.find, c.replace) ?? now, first.value);
  if (value === first.value) return first;
  const faults = await check(value);
  return faults.length < first.faults.length ? { value, faults } : first;
}

const notes = (faults: CodeFault[]): Flag[] => faults.map((f) => ({ code: 'reviewNote', values: { where: f.title, text: faultNote(f) } }));

/** The sheets as they run, with a note for each line that still stops. */
export async function sheetsRun(inference: Inference, runner: LineRunner | undefined, course: Course, lesson: Lesson, handouts: Handout[], signal?: AbortSignal): Promise<{ handouts: Handout[]; flags: Flag[] }> {
  if (!runner || !handouts.length) return { handouts, flags: [] };
  try {
    // The sheets alone: the lesson's work is written later and run when it is.
    const check = (sheets: Handout[]) => alone(runner, () => lessonCodeFaults(runner, course, { ...lesson, handouts: sheets, taskIds: [] })).then((f) => f.filter((x) => x.kind === 'handout'));
    const out = await mended(inference, { value: handouts, faults: await check(handouts) }, (v) => JSON.stringify(v.map((h) => ({ title: h.title, blocks: h.blocks })), null, 1), check, signal);
    return { handouts: out.value, flags: notes(out.faults) };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { handouts, flags: [] };
  }
}

/** The work as it runs, each piece carrying a note for a line of its own that still stops. */
export async function workRun(inference: Inference, runner: LineRunner | undefined, course: Course, lesson: Lesson, tasks: Task[], signal?: AbortSignal): Promise<Task[]> {
  const work = tasks.filter((t) => t.kind === 'assignment');
  if (!runner || !work.length) return tasks;
  try {
    const check = (now: Task[]) => {
      const set = { ...course, tasks: { ...course.tasks, ...Object.fromEntries(now.map((t) => [t.id, t])) } };
      return alone(runner, () => lessonCodeFaults(runner, set, { ...lesson, taskIds: now.map((t) => t.id) })).then((f) => f.filter((x) => x.kind === 'assignment'));
    };
    const out = await mended(inference, { value: tasks, faults: await check(tasks) }, (v) => JSON.stringify(v.flatMap((t) => (t.kind === 'assignment' ? [{ title: t.title, steps: t.steps }] : [])), null, 1), check, signal);
    return out.value.map((t) => (t.kind === 'assignment' ? { ...t, flags: [...t.flags, ...notes(out.faults.filter((f) => f.title === t.title))] } : t));
  } catch (error) {
    if (signal?.aborted) throw error;
    return tasks;
  }
}

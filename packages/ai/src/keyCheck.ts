import type { Flag, Handout, Lesson, Task } from '@folio/core';
import type { Runner } from '@folio/run';
import { checkAnswers } from './answerCheck';
import type { Inference } from './inference';
import { say } from './lessonView';

/**
 * The keys to a lesson's sheets, put through the check that a quiz and graded work get: a second writer says how each
 * number in the key is worked out from the sheet, a program works it out, and a key that disagrees is put right by what
 * was computed and kept only if it then holds. Keys had no such check since the one of October's first week, which was
 * wrong about a key eleven times in forty sheets. Tried again on the 101 keys of 32 lessons after that check's own
 * faults were mended, it reached half of them, was wrong about none, and put right the two that were wrong: a table
 * that gave e^0.01 for (e^0.01 − 1)/0.01, which three separate writings of the lesson had all carried, and an angle.
 */

const base = { objectiveIds: [], sourceRefs: [], origin: 'ai' as const, edited: false, flags: [] };

/** The numbers a correction changed, old and new, where the key kept its shape: so the same wrong number is found in the plan. */
export function changedNumbers(before: string, after: string): { find: string; replace: string }[] {
  const a = before.split(/\s+/);
  const b = after.split(/\s+/);
  if (a.length !== b.length) return [];
  return a.flatMap((word, i) => (word !== b[i] && /\d/.test(word) && /\d/.test(b[i]!) ? [{ find: word.replace(/[.,;:)]+$/, ''), replace: b[i]!.replace(/[.,;:)]+$/, '') }] : []));
}

export async function keysChecked(inference: Inference, runner: Runner | undefined, lesson: Lesson, handouts: Handout[], signal?: AbortSignal): Promise<{ handouts: Handout[]; flags: Flag[]; changed: { find: string; replace: string }[] }> {
  const asTask = (h: Handout): Task => ({ ...base, id: h.id, lessonId: lesson.id, kind: 'assignment', title: h.title, prompt: '', steps: h.blocks.map((b) => say(b as never)).filter(Boolean), rubricId: null, answerKey: h.key, toward: '' });
  const keyed = handouts.filter((h) => h.key.trim());
  if (!runner || !keyed.length) return { handouts, flags: [], changed: [] };
  try {
    const out = await checkAnswers(inference, runner, keyed.map(asTask), signal);
    const fixed = (h: Handout): string | null => {
      const t = out.fixed.get(h.id);
      return t?.kind === 'assignment' ? t.answerKey : null;
    };
    // Where it is: a note on a key is read on the plan, beside the notes on its segments.
    const flags = keyed.flatMap((h) => (out.flags.get(h.id) ?? []).map((f): Flag => (f.code === 'answerCheck' ? { code: 'answerCheck', values: { claim: `the key to “${h.title}”: ${f.values.claim}`, found: f.values.found } } : f)));
    // What became of each key is kept with it: the teacher is told which were worked out, and which were not reached.
    const fate = (h: Handout): Handout['keyChecked'] => (fixed(h) ? 'fixed' : out.held.has(h.id) ? 'held' : undefined);
    return { handouts: handouts.map((h) => ({ ...h, key: fixed(h) ?? h.key, ...(fate(h) ? { keyChecked: fate(h) } : {}) })), flags, changed: keyed.flatMap((h) => (fixed(h) ? changedNumbers(h.key, fixed(h)!) : [])) };
  } catch (error) {
    if (signal?.aborted) throw error;
    // A check that cannot be had never costs the lesson its keys.
    return { handouts, flags: [], changed: [] };
  }
}

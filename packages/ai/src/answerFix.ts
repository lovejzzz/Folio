import type { Flag, Task } from '@folio/core';
import { z } from 'zod';
import type { Inference } from './inference';
import { runJob } from './jobs';
import { placed } from './lastRead';

/**
 * An item the answer check failed, put right by its numbers. The check computes what an item claims from the
 * item's own data, and what failed twice was only told to the teacher: a worksheet's key went out with a median of
 * 4.5 for data whose median is 4, beside a note that said "computed [4.0]". The words at fault are now replaced
 * with what was computed, the item is checked once more, and it is kept only if it then holds.
 */

export const AnswerFix = z.object({
  changes: z
    .array(z.object({ find: z.string().min(1).describe('The exact words at fault, copied character for character from the item, where they stand only once'), replace: z.string().describe('What stands in their place') }))
    .max(8)
    .default([])
    .describe('Empty when the item is right as it stands and the check is mistaken'),
});

const ASK = [
  'A checking program worked out, from the data in this item, what the item claims, and found that what is stored does not agree. The item is a quiz question or the brief and answer key of a piece of work, given below with what the check found.',
  'Work the item out yourself from its own data. Where the stored text is wrong (a key or explanation worked by hand, a value carried over from a draft), give the changes of words that make it right, every place that states or depends on the wrong value included: the working, the result, and what is concluded from it. Change nothing students are asked to do, and no data.',
  'When a choice question has no right choice or two, change the wording of a wrong choice or the key so that exactly one is right. When the item is right and the check mistaken, give no changes.',
].join(' ');

type Found = Extract<Flag, { code: 'answerCheck' }>;

/** The item with the words at fault replaced, or null when nothing was changed or a change could not be placed. */
export async function corrected(inference: Inference, task: Task, shown: unknown, flags: Flag[], signal?: AbortSignal): Promise<Task | null> {
  const found = flags.filter((f): f is Found => f.code === 'answerCheck').map((f) => `- ${f.values.claim}: ${f.values.found}`);
  if (!found.length) return null;
  const result = await runJob(inference, { task: 'folio_answer_fix', system: 'You correct course materials. Reply with one JSON object and nothing else.', prompt: `${ASK}\n\nThe item:\n${JSON.stringify(shown, null, 1)}\n\nWhat the check found:\n${found.join('\n')}`, effort: 'medium', schema: AnswerFix, repair: false, signal });
  let now = task;
  for (const change of result.value.changes) {
    const got = placed(now, change.find, change.replace);
    if (got.hits !== 1) return null;
    now = got.value;
  }
  return now === task ? null : now;
}

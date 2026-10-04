import type { Course, Flag, Lesson } from '@folio/core';
import { z } from 'zod';
import { earlierLessons } from './continuity';
import type { Inference } from './inference';
import { runJob } from './jobs';
import { sinceText, type Since } from './mend';
import type { ModuleDraft } from './online';
import { courseBackground, lessonContext, systemPrompt } from './prompts';

/**
 * A second read of a week's module page, by a reader who does what the student will do: follow it alone, to the
 * letter. A plan's reviewer asks "is this right?"; a page's reviewer also asks "could I do this with nobody to ask?".
 */

const line = z.string().min(1);

export const ModuleReviewDraft = z.object({
  issues: z
    .array(
      z.object({
        part: z.number().int().min(0).describe('The part\'s number as shown; 0 for the introduction, the checklist or the wrap-up'),
        kind: z.enum(['fact', 'missing', 'feasibility', 'consistency', 'level']),
        why: line.describe('What is wrong and what a student would experience, briefly, for the teacher'),
        find: z.string().describe('The exact wrong words, copied character for character from that part; empty when the fix needs more than a few words'),
        replace: z.string().describe('What should stand in their place; empty when "find" is empty'),
      }),
    )
    .max(16)
    .default([]),
});
export type ModuleIssue = z.infer<typeof ModuleReviewDraft>['issues'][number];

type Block = ModuleDraft['parts'][number]['blocks'][number];

function blockText(b: Block): string {
  const media = b.type === 'image' || b.type === 'video' || b.type === 'file';
  const head = b.type === 'callout' || b.type === 'code' ? `[${b.type}${b.kind ? `: ${b.kind}` : ''}] ${b.title}`.trim() : media ? `[${b.type}${b.kind ? `: ${b.kind}` : ''}] shows: ${b.shows}${b.alt ? ` | alt: ${b.alt}` : ''}` : '';
  // A file with its name on its own line was read as a download with no name.
  if (b.type === 'file') return `[file to download${b.kind ? `, ${b.kind}` : ''}] ${b.text} (holds: ${b.shows})`;
  const shots = b.shots.map((s) => `  [picture under step ${s.step}] shows: ${s.shows} | alt: ${s.alt}`).join('\n');
  const items = b.items.map((item, i) => (b.type === 'steps' ? `${i + 1}. ${item}` : `- ${item}`)).join('\n');
  return [head, b.text, items, shots, b.transcript && `Transcript: ${b.transcript}`].filter(Boolean).join('\n');
}

function moduleText(v: ModuleDraft): string {
  const checklist = v.checklist.map((c) => `- ${c.label} (${c.activity}, ${c.minutes} min${c.due ? `, due ${c.due}` : ''})`).join('\n');
  const parts = v.parts.map((p, i) => `Part ${i + 1}: ${p.title}\n${p.blocks.map(blockText).join('\n')}`).join('\n\n');
  // The total is given: a reviewer adding it up got 640 for 540, and noted a workload problem that was not there.
  // Without what is optional, as the week is counted: given with it, the reviewer noted a total the page never states.
  const total = v.checklist.reduce((n, c) => n + (/\boptional\b/i.test(c.label) ? 0 : c.minutes), 0);
  // The run of show is read too: unread, its "what is due" lines named work the page never set.
  const live = v.live.length ? `Live session (${v.live.reduce((n, x) => n + x.minutes, 0)} minutes in all):\n${v.live.map((x) => `- ${x.title} (${x.kind}, ${x.minutes} min): ${x.description}${x.teacherNotes ? ` [Instructor: ${x.teacherNotes}]` : ''}`).join('\n')}` : '';
  return [`Introduction: ${v.intro}`, `Checklist (${total} minutes in all, optional items not counted):\n${checklist}`, parts, live, `Wrap-up: ${v.wrapUp}`].filter(Boolean).join('\n\n');
}

export function moduleReviewPrompt(course: Course, lesson: Lesson, v: ModuleDraft, since?: Since): string {
  return [
    lessonContext(course, lesson),
    earlierLessons(course, lesson),
    sinceText(since, 'part'),
    `The module page to review:\n${moduleText(v)}`,
    [
      'Read this page as the student will: alone at home, with no one to ask, doing exactly what it says and nothing it does not say. Then read it again as an experienced teacher of the subject. List every problem that would stop, mislead or misinform a student:',
      'follow every step from where the step before left the student: nothing is clicked that was never opened, used that was never made or downloaded, or named differently from where it was made; every menu, button, field, default value and message is what the named version of the tool really shows; what each checkpoint says the student will see is what would really be there;',
      'run every piece of code in your head as written, in the file and place the page says: it must compile, do what the page says it does, and agree with its explanation; work out every number yourself;',
      'check every fact, definition and example against what is true, and every term against where it was first explained, on this page or in earlier weeks;',
      'check that nothing is promised and not given (a file, a video, a reading, a setting), and that the week can be done in the hours the checklist gives it;',
      'and, when earlier weeks are given, check the page keeps to their names and continues the project as they left it.',
      'Kinds: "fact" (wrong content), "missing" (a step, explanation or thing the student needs is not there), "feasibility" (cannot be done as written), "consistency" (the page contradicts itself or earlier weeks), "level" (too much assumed of these students).',
      'For each problem, say under "why" what is wrong and what the student would experience. When a change to a few words fixes it and you are sure, copy under "find" the exact words that are wrong, enough of them to appear only once in that part, and give under "replace" what should stand in their place; to add what is missing (a step, a sentence of explanation, the fix in a troubleshooting note), write it yourself: find the sentence it belongs after and replace it with that sentence followed by the new words. Leave both empty only when the fix needs a decision that is the teacher\'s.',
      'What the tool\'s screens are called and hold is settled by the teacher\'s sources when they say; where they are silent and you are not certain of the named version, do not correct the page from memory.',
      'The week\'s other materials (the self-check, the forum prompt, the graded work and its rubric, the "Stuck?" list, the recap) are written separately from this page: do not list them as missing. Pictures and videos are made after the page is written: judge what each is asked to show, not its absence.',
      'Do not list style preferences or things you would add, and give no links. Return an empty list if the page is sound.',
    ].join(' '),
  ]
    .filter(Boolean)
    .join('\n\n');
}

const TEXT_FIELDS = ['text', 'title', 'transcript', 'shows', 'alt'] as const;

/** The block with the quoted words replaced where they stand, counting how often they were found. */
function swapBlock(b: Block, edit: ModuleIssue): { block: Block; hits: number } {
  let hits = 0;
  const swap = (text: string) => {
    const n = text.split(edit.find).length - 1;
    hits += n;
    return n === 1 ? text.replace(edit.find, () => edit.replace) : text;
  };
  const block = { ...b, items: b.items.map(swap) };
  for (const f of TEXT_FIELDS) block[f] = swap(b[f]);
  return { block, hits };
}

/** The page with one fix made, or null when its words are not there exactly once in the part it names. */
function fixed(v: ModuleDraft, edit: ModuleIssue): ModuleDraft | null {
  if (!edit.find) return null;
  const once = (text: string) => text.split(edit.find).length === 2;
  if (edit.part === 0) {
    if (once(v.intro) && !once(v.wrapUp)) return { ...v, intro: v.intro.replace(edit.find, () => edit.replace) };
    if (once(v.wrapUp) && !once(v.intro)) return { ...v, wrapUp: v.wrapUp.replace(edit.find, () => edit.replace) };
    return null;
  }
  const part = v.parts[edit.part - 1];
  if (!part) return null;
  const swapped = part.blocks.map((b) => swapBlock(b, edit));
  if (swapped.reduce((n, s) => n + s.hits, 0) !== 1) return null;
  return { ...v, parts: v.parts.map((p, i) => (i === edit.part - 1 ? { ...p, blocks: swapped.map((s) => s.block) } : p)) };
}

export function applyModuleReview(v: ModuleDraft, issues: ModuleIssue[]): { value: ModuleDraft; applied: ModuleIssue[]; notes: ModuleIssue[] } {
  let value = v;
  const applied: ModuleIssue[] = [];
  const notes: ModuleIssue[] = [];
  for (const issue of issues) {
    const after = fixed(value, issue);
    if (after) {
      value = after;
      applied.push(issue);
    } else notes.push(issue);
  }
  return { value, applied, notes };
}

type ReviewNote = Extract<Flag, { code: 'reviewNote' }>;

/** Review a freshly written page: small sure fixes are made, the rest come back as notes for a rewrite or the teacher. */
export async function reviewModule(inference: Inference, course: Course, lesson: Lesson, v: ModuleDraft, signal?: AbortSignal, since?: Since): Promise<{ value: ModuleDraft; fixes: string[]; notes: ReviewNote[] }> {
  const result = await runJob(inference, {
    task: 'folio_module_review',
    system: systemPrompt(course.language, course.locale),
    context: courseBackground(course),
    prompt: moduleReviewPrompt(course, lesson, v, since),
    effort: 'medium',
    schema: ModuleReviewDraft,
    signal,
  });
  const { value, applied, notes } = applyModuleReview(v, result.value.issues);
  const where = (n: ModuleIssue) => (n.part > 0 && value.parts[n.part - 1] ? `Part ${n.part}, ${value.parts[n.part - 1]!.title}` : 'The page');
  return { value, fixes: applied.map((i) => i.why), notes: notes.map((n) => ({ code: 'reviewNote', values: { where: where(n), text: n.why } })) };
}

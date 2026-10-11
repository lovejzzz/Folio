import { cmd, CourseStore, lessonPieces, newId, orderedLessons, piecesLackingRubric, type Assignment, type Command, type Course, type Lesson, type Rubric } from '@folio/core';
import { InferenceError, type Inference } from './inference';
import { runJob } from './jobs';
import { courseBackground, lessonContext, systemPrompt } from './prompts';
import { universityRubric } from './scales';
import { AssignmentDraft } from './schemas';

/**
 * A rubric for graded work that stands without one. Rubrics were written only with their assignment, so a piece
 * whose rubric was deleted, or lost on the way in from a file, could get one back only by being written again:
 * the teacher's own words replaced to mend what was missing beside them. Here the piece is read and not touched.
 * Where another piece of the same component has a rubric, that one is taken as it is (every part of a component is
 * scored on one rubric) and no model is asked.
 */

const RubricDraft = AssignmentDraft.shape.rubric;

/**
 * What a piece says of its own scoring, which a rubric given to it must keep: "Each criterion earns 1–4 points, for a
 * total of 12 points." Four real pieces that said so were each given four criteria of four levels: sixteen points
 * under a brief that promised twelve. The piece is the teacher's and is not changed to fit; the rubric fits or is not given.
 */
export interface ScoringSaid {
  /** The piece's own sentences on how it is scored, as written. */
  sentences: string[];
  /** The most one criterion earns, when the piece says. */
  top?: number;
  /** The total, when the piece says. */
  total?: number;
}

export function scoringSaid(piece: Assignment): ScoringSaid {
  const text = [piece.prompt, ...piece.steps].join('\n');
  const sentences = text.split(/(?<=[.!?])\s+|\n/).filter((x) => /\bpoints?\b|\btotal\b|\bcriteri(?:on|a)\b|\bout of \d|\brubric\b/i.test(x)).map((x) => x.trim());
  const said = sentences.join(' ');
  const total = /\btotal of (\d+)|\bout of (\d+)|\b(\d+) points? (?:in total|in all|altogether)|\btotal(?: is|:)? (\d+)/i.exec(said);
  const each = /\bcriteri(?:on|a)\b[^.]*?\b\d+\s*(?:–|-|to)\s*(\d+) points?|\bup to (\d+) points? (?:each|per criterion)/i.exec(said);
  const n = (m: RegExpExecArray | null) => (m ? Number(m.slice(1).find(Boolean)) : undefined);
  return { sentences, ...(n(each) ? { top: n(each)! } : {}), ...(n(total) ? { total: n(total)! } : {}) };
}

/** Why a rubric does not keep what the piece says of its scoring, as its writer can put it right; null when it does. */
export function scoringBroken(rubric: { levels: { points: number }[]; criteria: unknown[] }, said: ScoringSaid): string | null {
  const top = Math.max(0, ...rubric.levels.map((lv) => lv.points));
  if (said.top !== undefined && top !== said.top) return `the piece says a criterion earns at most ${said.top}, and the top level here is ${top}`;
  if (said.total !== undefined && rubric.criteria.length * top !== said.total) return `the piece says the total is ${said.total}; ${rubric.criteria.length} criteria of up to ${top} make ${rubric.criteria.length * top}: give exactly ${top ? said.total / top : said.total} criteria${Number.isInteger(said.total / (top || 1)) ? '' : ', or levels whose top makes the total'}`;
  return null;
}

/**
 * The rubric another piece of the same component already has, copied under a new id and this piece's own title: the
 * component's one rubric. Only when it keeps what this piece says of its scoring; a rubric that does not is not taken.
 */
export function siblingRubric(course: Course, piece: Assignment): Rubric | null {
  if (!piece.toward.trim()) return null;
  const said = scoringSaid(piece);
  // The same words on how it is scored, in both pieces: that is the shared contract. A name in common and a total
  // that happens to agree are not one, and a piece that says nothing of its scoring shares none.
  // The sentences that state points in numbers: a piece's other remarks on scoring ("scored alone") are its own.
  const stated = (x: ScoringSaid) => x.sentences.filter((line) => /\d[^.]*\bpoints?\b/i.test(line)).join(' ');
  const same = (other: Assignment) => stated(said) !== '' && stated(scoringSaid(other)) === stated(said);
  const found = Object.values(course.tasks)
    .flatMap((t) => (t.kind === 'assignment' && t.id !== piece.id && t.toward.trim() === piece.toward.trim() && same(t) && t.rubricId && course.rubrics[t.rubricId] ? [course.rubrics[t.rubricId]!] : []))
    .find((r) => !scoringBroken(r, said));
  if (!found) return null;
  const levels = found.levels.map((lv) => ({ ...lv, id: newId('x') }));
  return { id: newId('r'), title: piece.title, levels, criteria: found.criteria.map((c) => ({ id: newId('x'), name: c.name, descriptors: Object.fromEntries(found.levels.map((lv, i) => [levels[i]!.id, c.descriptors[lv.id] ?? ''])) })) };
}

/**
 * What could not be checked of a rubric against its piece, said to the teacher on the piece; empty when the piece's
 * scoring was read and kept. A piece that speaks of points in words no rule here reads is not thereby unconstrained.
 */
export function unchecked(piece: Assignment): string {
  const said = scoringSaid(piece);
  if (said.top !== undefined || said.total !== undefined) return '';
  return said.sentences.length ? `This rubric was written for the piece as it stands, and the piece speaks of its scoring in words Folio could not check it against (${said.sentences.map((x) => `“${x}”`).join(' ')}): compare the two before you use it.` : 'This rubric was written for the piece as it stands. The piece itself says nothing of how it is scored, so there was nothing to hold the rubric to: check that its criteria and points are what you intend.';
}

export function rubricAlonePrompt(course: Course, lesson: Lesson, piece: Assignment, fault = ''): string {
  // A rubric written for the first of a run of pieces is taken by the rest: written to that piece's own topic, a
  // problem set on stacks was scored on "Code for `count` and `remove_front`", which was the week before's.
  const run = piece.toward.trim() && orderedLessons(course).filter((l) => lessonPieces(l).some((p) => p.toward.trim() === piece.toward.trim())).length > 1;
  const shared = run ? ` Every piece of "${piece.toward.trim()}" in the course is scored on this one rubric: name its criteria for what any of them shows (such as correct results, reasoning shown, clear presentation), never for this lesson's topic, functions or documents, and write descriptors that fit them all.` : '';
  const said = scoringSaid(piece);
  const count = said.total !== undefined && said.top ? ` That is exactly ${said.total / said.top} criteria, the top level worth ${said.top}.` : '';
  const kept = said.sentences.length ? ` The piece itself says how it is scored, and the rubric keeps to it to the point: ${said.sentences.map((x) => `"${x}"`).join(' ')}${count}` : '';
  return [
    lessonContext(course, lesson),
    `This piece of graded work stands as written and is not to be changed in any word:\n\nTitle: ${piece.title}\n${piece.prompt}\n${piece.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
    `Write only its rubric: two to five criteria, each for something the piece as written asks a student to do, with a descriptor for every level that a marker could apply to a student's work. ${universityRubric(course.locale)} Nothing in the rubric asks for what the piece does not ask.${kept}${shared}`,
    fault ? `A first answer was not usable: ${fault}.` : '',
  ].filter(Boolean).join('\n\n');
}

/** A draft as the piece's rubric, or why it cannot be: no criteria, a criterion without a descriptor a level, or scoring the piece does not have. */
function fromDraft(v: { levels: { label: string; points: number }[]; criteria: { name: string; descriptors: string[] }[] }, piece: Assignment): Rubric | string {
  if (!v.criteria.length) return 'it has no criteria';
  if (v.criteria.some((c) => c.descriptors.length !== v.levels.length)) return 'a criterion has not one descriptor for each level';
  const broken = scoringBroken(v, scoringSaid(piece));
  if (broken) return broken;
  const levels = v.levels.map((lv) => ({ id: newId('x'), label: lv.label, points: lv.points }));
  return { id: newId('r'), title: piece.title, levels, criteria: v.criteria.map((c) => ({ id: newId('x'), name: c.name, descriptors: Object.fromEntries(levels.map((lv, i) => [lv.id, c.descriptors[i] ?? ''])) })) };
}

/**
 * The command that gives one piece its rubric: a sibling's that keeps this piece's scoring, or one written for it and
 * asked for once more when it does not. Throws when none that fits could be had: nothing is attached then.
 */
export async function rubricFor(inference: Inference, course: Course, lesson: Lesson, piece: Assignment, signal?: AbortSignal): Promise<Command> {
  const copied = siblingRubric(course, piece);
  if (copied) return cmd('rubric.attach', { taskId: piece.id, rubric: copied });
  const note = unchecked(piece);
  const ask = (fault = '') => runJob(inference, { task: 'folio_rubric', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: rubricAlonePrompt(course, lesson, piece, fault), effort: 'medium', schema: RubricDraft, signal });
  const first = fromDraft((await ask()).value, piece);
  const rubric = typeof first === 'string' ? fromDraft((await ask(first)).value, piece) : first;
  if (typeof rubric === 'string') throw new InferenceError('invalid', `No rubric that fits "${piece.title}" could be written: ${rubric}.`);
  return cmd('rubric.attach', { taskId: piece.id, rubric, ...(note ? { note } : {}) });
}

/**
 * A lesson's rubrics alone, as one part of a build: every piece of the lesson that lacks one is given one, in order,
 * so a later piece takes what an earlier one was given. All or none: a piece that could not be given a fitting rubric
 * fails the part, and nothing of it is kept.
 */
export async function lessonRubrics(inference: Inference, course: Course, lessonId: string, signal?: AbortSignal): Promise<Command[]> {
  const store = new CourseStore(course);
  const commands: Command[] = [];
  for (const { id } of piecesLackingRubric(course, course.lessons[lessonId]!)) {
    if (signal?.aborted) throw new InferenceError('aborted', 'Stopped.');
    const now = store.getState();
    const piece = now.tasks[id];
    if (piece?.kind !== 'assignment') continue;
    const command = await rubricFor(inference, now, now.lessons[lessonId]!, piece, signal);
    store.apply([command], { label: { key: 'built' }, source: 'ai', undoable: false });
    commands.push(command);
  }
  return commands;
}

export { piecesLackingRubric };

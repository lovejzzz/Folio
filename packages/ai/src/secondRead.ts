import type { Flag } from '@folio/core';
import { InferenceError } from './inference';
import type { Problem } from './jobs';
import type { Mended, Since } from './mend';

type ReviewNote = Extract<Flag, { code: 'reviewNote' }>;

/** A second read: the draft with its sure fixes made, why each was made, and what is left as notes. Told of the first reading, it reads what changed. */
export type Read<T> = (draft: T, since?: Since) => Promise<{ value: T; fixes: string[]; notes: ReviewNote[] }>;
/** Puts right what a reading found, changing only the parts at fault. */
export type Mend<T> = (draft: T, notes: ReviewNote[]) => Promise<Mended<T>>;

export type ReadProgress =
  | { type: 'checking' }
  | { type: 'running' }
  | { type: 'reviewed'; fixes: string[]; notes: number }
  /** One round of mending: what was open, what was written again, what the next reading found, and whether the round was kept. */
  | { type: 'mended'; open: string[]; changed: string[]; found: string[]; kept: boolean };

/** A mend and the reading of it are two calls: twice at most, so a text that will not come right does not hold up what waits for it. */
const ROUNDS = 2;

/** Before a note that was sent to be put right and is still there. */
export const UNFIXED = 'Folio could not fix this itself:';

const said = (note: ReviewNote) => `${note.values.where}: ${note.values.text}`;
const stopped = (error: unknown) => error instanceof InferenceError && error.kind === 'aborted';

interface State<T> {
  value: T;
  /** What the reader found and nobody has put right. */
  notes: ReviewNote[];
  /** What the writer left for the teacher to decide, with the question. */
  kept: ReviewNote[];
}

/**
 * The text after its review, with what could not be put right as notes for the teacher; or the text as written
 * if the review can't be had: a failed second read must never cost the teacher the first. Stopping still stops.
 *
 * Notes the review can't fix in a few words used to stay while the slides, quiz and guide were built on the
 * flawed plan and repeated it; then the plan was written once more, whole, and the new one had as many notes of
 * its own. Now the parts at fault are mended and read again, and a round is kept only when it leaves fewer notes.
 */
export async function reviewed<T>(read: Read<T>, draft: T, onProgress: ((progress: ReadProgress) => void) | undefined, mend?: Mend<T>, check?: (value: T) => Problem[]): Promise<{ value: T; problems: Problem[] }> {
  // What the checks find goes to the same mend as the reader's notes: a caption that is missing is put right where it is missing.
  const checks = (value: T): ReviewNote[] => (check?.(value) ?? []).flatMap((p) => (p.flag.code === 'schemaIssue' ? [{ code: 'reviewNote' as const, values: { where: 'The page', text: String(p.flag.values.issue) } }] : []));
  const count = (s: State<T>) => s.notes.length + s.kept.length + checks(s.value).length;
  try {
    onProgress?.({ type: 'checking' });
    const first = await read(draft);
    const fixes = [...first.fixes];
    let state: State<T> = { value: first.value, notes: first.notes, kept: [] };
    let tried = false;
    for (let round = 0; round < ROUNDS && mend; round++) {
      const open = [...state.notes, ...checks(state.value)];
      if (!open.length) break;
      tried = true;
      const next = await mendOnce(read, mend, state, open, open.length - state.notes.length).catch((error: unknown) => (stopped(error) ? Promise.reject(error) : null));
      // Kept unless it leaves more to put right than it found: what it was told of is fixed, and what the next
      // reading finds in the parts written again is found for the first time as often as it is new.
      const kept = next !== null && count(next.state) <= count(state);
      if (next) onProgress?.({ type: 'mended', open: open.map(said), changed: next.changed, found: [...next.state.notes, ...checks(next.state.value)].map(said), kept });
      if (!next || !kept) break;
      state = next.state;
      fixes.push(...next.fixes);
    }
    // What a mend was tried on and did not put right is said as that, and first: the one true note of a lesson stood last
    // among the false, worded as a reply to a correction the teacher never saw, and three readings running nobody acted on it.
    const unfixed = state.notes.map((n) => (tried ? { code: 'reviewNote' as const, values: { where: n.values.where, text: `${UNFIXED} ${n.values.text}` } } : n));
    const notes = [...unfixed, ...state.kept];
    onProgress?.({ type: 'reviewed', fixes, notes: notes.length });
    return { value: state.value, problems: notes.map((flag) => ({ index: null, flag })) };
  } catch (error) {
    if (stopped(error)) throw error;
    // Kept as written, and marked: the teacher must know this plan had no second read.
    return { value: draft, problems: [{ index: null, flag: { code: 'unreviewed' } }] };
  }
}

/** One round: the parts at fault written again, then read again by a reader told what the first reading found. */
async function mendOnce<T>(read: Read<T>, mend: Mend<T>, state: State<T>, open: ReviewNote[], checks: number): Promise<{ state: State<T>; fixes: string[]; changed: string[] } | null> {
  const mended = await mend(state.value, open);
  if (!mended.changed.length && !mended.left.length) return null;
  const again = await read(mended.value, { notes: open, checks, changed: mended.changed, left: mended.left });
  // A problem that is the teacher's to decide stays as a note, with the question the writer put.
  const asked = mended.left.flatMap((l) => {
    const note = l.reason === 'teacher' ? state.notes[l.note - 1] : undefined;
    return note ? [{ code: 'reviewNote' as const, values: { where: note.values.where, text: `${note.values.text} ${l.why}` } }] : [];
  });
  return { state: { value: again.value, notes: again.notes, kept: [...state.kept, ...asked] }, fixes: again.fixes, changed: mended.changed };
}

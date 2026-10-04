import { fixNotes } from '@folio/ai';
import { lessonNumber, type Flag } from '@folio/core';
import { currentMessages } from '../i18n';
import { canReach, currentInference, errorMessage } from './model';
import { activeStore } from './session';
import { toast } from './toasts';
import { useUi } from './ui';

/** What came of asking for a note to be put right. */
export type FixOutcome =
  | { status: 'fixed' }
  /** The writer needs the teacher's decision first: the question it put. */
  | { status: 'asked'; why: string }
  /** The writer holds the page is right as it stands: what shows it. */
  | { status: 'kept'; why: string }
  | { status: 'failed' };

type ReviewNote = Extract<Flag, { code: 'reviewNote' }>;

/**
 * Put right one note on a lesson's plan or page, with what the teacher has decided when the note waited on that.
 * Only the parts at fault are written again; the rest of the page, and its pictures, stay as they are.
 */
export async function fixNote(lessonId: string, index: number, answer = ''): Promise<FixOutcome> {
  const store = activeStore();
  if (!store) return { status: 'failed' };
  const inference = currentInference();
  if (!inference) {
    useUi.getState().requireModel(() => undefined);
    return { status: 'failed' };
  }
  if (!canReach(inference)) return { status: 'failed' };
  const course = store.getState();
  const flags = course.lessons[lessonId]?.gen.plan?.flags ?? [];
  const note = flags[index];
  if (note?.code !== 'reviewNote') return { status: 'failed' };
  try {
    const fix = await fixNotes(inference, course, lessonId, [note as ReviewNote], flags.filter((_, i) => i !== index), answer);
    const left = fix.left[0];
    if (!fix.commands.length) return left ? { status: left.reason === 'teacher' ? 'asked' : 'kept', why: left.why } : { status: 'failed' };
    // Written from the lesson as it was when asked: put over a lesson edited since, it would undo those edits.
    if (store.getState().revision !== course.revision) {
      toast({ message: currentMessages().changes.fixStale, tone: 'attention' });
      return { status: 'failed' };
    }
    store.apply(fix.commands, { label: { key: 'fixedNote', values: { n: lessonNumber(course, lessonId) } }, source: 'ai' });
    return { status: 'fixed' };
  } catch (error) {
    toast({ message: errorMessage(error), tone: 'critical' });
    return { status: 'failed' };
  }
}

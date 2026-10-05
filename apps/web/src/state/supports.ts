import { supportedHandout } from '@folio/ai';
import { lessonNumber } from '@folio/core';
import { currentMessages } from '../i18n';
import { canReach, currentInference, errorMessage } from './model';
import { activeStore } from './session';
import { toast } from './toasts';
import { useUi } from './ui';

/**
 * Add, after a sheet, a copy of it with supports for students still learning the language. Asked for sheet by
 * sheet: the teacher knows who needs one. True when the copy was added.
 */
export async function addSupportedCopy(lessonId: string, handoutId: string): Promise<boolean> {
  const store = activeStore();
  const inference = currentInference();
  if (!store) return false;
  if (!inference) {
    useUi.getState().requireModel(() => undefined);
    return false;
  }
  if (!canReach(inference)) return false;
  const course = store.getState();
  try {
    const commands = await supportedHandout(inference, course, lessonId, handoutId, currentMessages().handouts.withSupports);
    // Written from the lesson as it was when asked: put over sheets edited since, it would undo those edits.
    if (store.getState().revision !== course.revision) {
      toast({ message: currentMessages().changes.fixStale, tone: 'attention' });
      return false;
    }
    store.apply(commands, { label: { key: 'editedLesson', values: { n: lessonNumber(course, lessonId) } }, source: 'ai' });
    return true;
  } catch (error) {
    toast({ message: errorMessage(error), tone: 'critical' });
    return false;
  }
}

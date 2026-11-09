import { drawSlide, pickDrawings } from '@folio/ai';
import { cmd, lessonNumber } from '@folio/core';
import { drawCard } from '../lib/drawing';
import { drawText } from '../i18n/drawText';
import { canReach, currentInference, errorMessage } from './model';
import { activeStore } from './session';
import { toast } from './toasts';
import { useUi } from './ui';

/**
 * One slide drawn as a picture because the teacher asked: how to draw it is chosen (with the teacher's idea, if
 * they gave one), the card is written, drawn in the page's drawing frame, checked, and mended once. Nothing changes
 * when it cannot be drawn clean: the teacher is told so.
 */
export async function drawSlideAt(lessonId: string, slideId: string, hint: string): Promise<void> {
  const store = activeStore();
  if (!store) return;
  const inference = currentInference();
  if (!inference) return useUi.getState().requireModel(() => undefined);
  if (!canReach(inference)) return;
  const course = store.getState();
  const lesson = course.lessons[lessonId];
  const n = lesson ? lesson.slides.findIndex((s) => s.id === slideId) + 1 : 0;
  if (!lesson || !n) return;
  try {
    const [pick] = await pickDrawings(inference, course, lesson, 1, undefined, { slide: n, hint: hint.trim() });
    const drawn = pick && (await drawSlide(inference, drawCard, course, lesson, pick));
    if (!drawn) return void toast({ message: drawText.noDrawing, tone: 'attention' });
    // Put on the slide as it is now: the teacher may have gone on editing while it was drawn.
    const now = store.getState().lessons[lessonId];
    if (!now?.slides.some((s) => s.id === slideId)) return;
    const slides = now.slides.map((s) => (s.id === slideId ? { ...s, visual: drawn } : s));
    store.apply([cmd('slides.update', { lessonId, slides })], { label: { key: 'editedMaterial', values: { kind: 'slides', n: lessonNumber(course, lessonId) } }, source: 'ai' });
  } catch (error) {
    toast({ message: errorMessage(error), tone: 'critical' });
  }
}

import { checkPicture, picturePlace, seesPictures, type Picture } from '@folio/ai';
import { cmd, lessonNumber, type PageBlock } from '@folio/core';
import { currentMessages } from '../i18n';
import { mediaAnywhere } from './mediaSync';
import { canReach, currentInference, errorMessage } from './model';
import { activeStore } from './session';
import { toast } from './toasts';
import { useUi } from './ui';

/** The longest side a picture is sent at: enough to read a window's labels, and a fraction of the bytes. */
const LONGEST = 1568;

/** The picture as a model is shown it: scaled down, as JPEG, in base64. */
async function forChecking(blob: Blob): Promise<Picture> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, LONGEST / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return { type: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
}

/** The picture's reference on the page: a block's, or the one under a step. */
function srcOf(page: readonly PageBlock[], id: string): string {
  for (const b of page) {
    if (b.id === id && b.type === 'image') return b.src;
    if (b.type === 'steps') for (const s of b.items) if (s.id === id && s.shot) return s.shot.src;
  }
  return '';
}

type Check = { problems: string[]; personal: string[] };

/** The page with what was found written on the picture it was found in. */
function withCheck(page: readonly PageBlock[], id: string, check: Check): PageBlock[] {
  return page.map((b) => {
    if (b.id === id && b.type === 'image') return { ...b, check };
    if (b.type === 'steps') return { ...b, items: b.items.map((s) => (s.id === id && s.shot ? { ...s, shot: { ...s.shot, check } } : s)) };
    return b;
  });
}

/**
 * Look at one picture beside the step it sits under, and keep what was found on the picture. A reading of the
 * page's words cannot see its pictures; this is the only check that does.
 */
export async function checkPictureAt(lessonId: string, id: string): Promise<void> {
  const store = activeStore();
  if (!store) return;
  const inference = currentInference();
  if (!inference) return useUi.getState().requireModel(() => undefined);
  if (!seesPictures(inference.provider)) return void toast({ message: currentMessages().module.checkNoSight, tone: 'attention' });
  if (!canReach(inference)) return;
  const course = store.getState();
  const lesson = course.lessons[lessonId];
  const place = lesson && picturePlace(lesson.page, id);
  const src = lesson ? srcOf(lesson.page, id) : '';
  if (!lesson || !place || !src) return;
  try {
    const blob = (await mediaAnywhere(course.id, src))?.blob ?? (await (await fetch(src)).blob());
    const found = await checkPicture(inference, course, lesson, place, await forChecking(blob));
    // Written onto the page as it is now: the teacher may have gone on editing while the picture was looked at.
    const now = store.getState().lessons[lessonId];
    if (!now || srcOf(now.page, id) !== src) return;
    store.apply([cmd('plan.update', { lessonId, page: withCheck(now.page, id, { problems: found.problems, personal: found.personal }) })], { label: { key: 'checkedPicture', values: { n: lessonNumber(course, lessonId) } }, source: 'ai' });
  } catch (error) {
    toast({ message: errorMessage(error), tone: 'critical' });
  }
}

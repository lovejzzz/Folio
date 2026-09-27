import type { useNavigate } from '@tanstack/react-router';
import { createSession, loadSession } from '../state/session';

const KEY = 'folio.sampleId';

function remembered(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Open the bundled sample course, reusing the copy on this device if there is one. */
export async function openSample(navigate: ReturnType<typeof useNavigate>): Promise<void> {
  const id = remembered();
  // The copy on this device opens with its undo history.
  const existing = id ? await loadSession(id) : null;
  let courseId: string;
  if (existing) {
    courseId = existing.getState().id;
  } else {
    const { sampleCourse } = await import('@folio/core/sample');
    const course = sampleCourse();
    await createSession(course);
    courseId = course.id;
    try {
      localStorage.setItem(KEY, course.id);
    } catch {
      /* storage unavailable */
    }
  }
  await navigate({ to: '/c/$courseId/map', params: { courseId } });
}

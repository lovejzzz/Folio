import type { useNavigate } from '@tanstack/react-router';
import { loadCourse } from '../state/db';
import { createSession, openSession } from '../state/session';

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
  const existing = id ? await loadCourse(id) : null;
  let courseId: string;
  if (existing) {
    openSession(existing);
    courseId = existing.id;
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

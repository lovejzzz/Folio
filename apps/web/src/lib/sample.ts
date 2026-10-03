import type { useNavigate } from '@tanstack/react-router';
import { newId, parseCourse } from '@folio/core';
import { createSession, loadSession } from '../state/session';
import type { SampleName } from './samples';

const key = (name: SampleName) => `folio.sample.${name}`;

function remembered(name: SampleName): string | null {
  try {
    return localStorage.getItem(key(name));
  } catch {
    return null;
  }
}

/**
 * Open a sample course, reusing the copy on this device if there is one. A first opening makes the teacher's
 * own copy: a new course, dated now, theirs to change.
 */
export async function openSample(navigate: ReturnType<typeof useNavigate>, name: SampleName): Promise<void> {
  const id = remembered(name);
  // The copy on this device opens with its undo history.
  const existing = id ? await loadSession(id) : null;
  let courseId: string;
  if (existing) {
    courseId = existing.getState().id;
  } else {
    const response = await fetch(`/samples/${name}.json`);
    if (!response.ok) throw new Error(`sample ${name}: ${response.status}`);
    const now = new Date().toISOString();
    const course = { ...parseCourse(await response.json()), id: newId('c'), createdAt: now, updatedAt: now };
    await createSession(course);
    courseId = course.id;
    try {
      localStorage.setItem(key(name), course.id);
    } catch {
      /* storage unavailable */
    }
  }
  await navigate({ to: '/c/$courseId/map', params: { courseId } });
}

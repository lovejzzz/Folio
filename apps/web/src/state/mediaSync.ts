import { pageMediaRefs, localMediaId, type Course } from '@folio/core';
import { accountText } from './accountText';
import { useAccount } from './account';
import { db, type MediaRow } from './db';
import { getMedia, restoreMedia } from './media';
import { toast } from './toasts';

/**
 * The pictures, clips and files of a course in the signed-in account: sent once each, after the course itself,
 * and fetched by a device that is shown a page naming one it does not have. Kept apart from the course's own
 * sync: a picture that could not be sent never holds back the text.
 */

/** The largest file the account takes: a request to Folio's server can carry no more. A larger clip stays on its device. */
export const MAX_SYNCED_BYTES = 95 * 1024 * 1024;

const linked = async (courseId: string) => {
  const user = useAccount.getState().user;
  const row = await db.sync.get(courseId);
  return row && user && row.account === user.id && row.state === 'linked' ? row : undefined;
};

const call = (path: string, init: RequestInit = {}) => fetch(`/api/${path}`, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...(init.method && init.method !== 'GET' ? { 'x-folio': '1' } : {}) }, credentials: 'same-origin' });

/** Every media ID the course's pages name. */
function named(course: Course): string[] {
  const refs = [...Object.values(course.lessons).flatMap((l) => pageMediaRefs(l.page)), ...course.pages.flatMap((p) => pageMediaRefs(p.blocks))];
  return [...new Set(refs.flatMap((ref) => localMediaId(ref) ?? []))];
}

/** Send what the account does not have yet. Quietly: whatever goes wrong here, the course itself is already safe. */
export async function sendMedia(course: Course): Promise<void> {
  const row = await linked(course.id);
  if (!row) return;
  const sent = new Set(row.media ?? []);
  for (const id of named(course)) {
    if (sent.has(id)) continue;
    const local = await getMedia(course.id, id);
    if (!local || local.bytes > MAX_SYNCED_BYTES) continue;
    const res = await call(`courses/${course.id}/media/${id}`, { method: 'PUT', body: local.blob, headers: { 'content-type': local.type || 'application/octet-stream', 'x-folio-name': encodeURIComponent(local.name) } });
    // No store on the server, or signed out: nothing more to try now.
    if (res.status === 501 || res.status === 401) return;
    if (res.status === 507) {
      toast({ key: 'media-full', message: accountText.mediaFull, tone: 'attention', duration: 0 });
      break;
    }
    if (res.ok) sent.add(id);
  }
  const now = await db.sync.get(course.id);
  if (now) await db.sync.put({ ...now, media: [...sent] });
}

/** Take a copy of something the account holds and this device does not. Null when it is not there either. */
export async function fetchMedia(courseId: string, id: string): Promise<MediaRow | null> {
  if (!(await linked(courseId))) return null;
  try {
    const res = await call(`courses/${courseId}/media/${id}`);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    await restoreMedia(courseId, { id, name: decodeURIComponent(res.headers.get('x-folio-name') ?? '') || id, type: res.headers.get('content-type') ?? '', bytes });
    return await getMedia(courseId, id);
  } catch {
    return null;
  }
}

/** What a reference stands for, from this device or, failing that, the account: for an export or a backup, which must have every file. */
export async function mediaAnywhere(courseId: string, ref: string): Promise<MediaRow | null> {
  const id = localMediaId(ref);
  return id ? ((await getMedia(courseId, id)) ?? fetchMedia(courseId, id)) : null;
}

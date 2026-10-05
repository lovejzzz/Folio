import type { Env, R2Bucket, User } from './types';

/**
 * The pictures, clips and files a teacher adds to a course's pages, kept for the account so that they are on
 * every device the teacher signs in on. The course itself holds only `media:<id>`; the bytes are here, one object
 * each, under the account and the course: nothing is public, and every read is the owner's own.
 */

const MB = 1024 * 1024;
/** One file. A request to Folio's server can carry no more; a larger clip stays on the device it was added on. */
export const MAX_MEDIA_BYTES = 95 * MB;
/** Everything one account keeps. Storage is paid by the gigabyte: a limit keeps one account from spending it for all. */
export const MAX_ACCOUNT_MEDIA_BYTES = 2048 * MB;

/** An ID as the page makes it: letters, digits and underscores, then the file's extension. */
export const MEDIA_ID = /^[A-Za-z0-9_-]{1,64}(\.[a-z0-9]{1,8})?$/;

const keyOf = (userId: string, courseId: string, id: string) => `${userId}/${courseId}/${id}`;

async function all(bucket: R2Bucket, prefix: string): Promise<{ key: string; size: number }[]> {
  const found: { key: string; size: number }[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    found.push(...page.objects.map((o) => ({ key: o.key, size: o.size })));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return found;
}

/** The IDs the account holds for a course, with their sizes. */
export async function listMedia(bucket: R2Bucket, userId: string, courseId: string): Promise<{ id: string; bytes: number }[]> {
  const prefix = `${userId}/${courseId}/`;
  return (await all(bucket, prefix)).map((o) => ({ id: o.key.slice(prefix.length), bytes: o.size }));
}

/**
 * The types a file is kept and served as. It is served from Folio's own address, where a page or an SVG could run
 * script as the person signed in: only what can never run keeps its type, and anything else is a download.
 * The same list as the app's `safeMediaType`.
 */
const SHOWN_AS_ITSELF = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']);
const safeMediaType = (type: string): string => (SHOWN_AS_ITSELF.has(type.trim().toLowerCase()) ? type.trim().toLowerCase() : 'application/octet-stream');

export type PutResult = 'ok' | 'too-large' | 'account-full';

export async function putMedia(bucket: R2Bucket, userId: string, courseId: string, id: string, data: ArrayBuffer, type: string, name: string): Promise<PutResult> {
  if (data.byteLength === 0 || data.byteLength > MAX_MEDIA_BYTES) return 'too-large';
  const held = (await all(bucket, `${userId}/`)).filter((o) => o.key !== keyOf(userId, courseId, id)).reduce((n, o) => n + o.size, 0);
  if (held + data.byteLength > MAX_ACCOUNT_MEDIA_BYTES) return 'account-full';
  await bucket.put(keyOf(userId, courseId, id), data, { httpMetadata: { contentType: safeMediaType(type) }, customMetadata: { name } });
  return 'ok';
}

export async function getMedia(bucket: R2Bucket, userId: string, courseId: string, id: string): Promise<Response | null> {
  const found = await bucket.get(keyOf(userId, courseId, id));
  if (!found) return null;
  return new Response(found.body, {
    headers: {
      'content-type': safeMediaType(found.httpMetadata?.contentType ?? ''),
      'content-length': String(found.size),
      // The file's own name, for the device that takes a copy; encoded, since a name can hold anything.
      'x-folio-name': encodeURIComponent(found.customMetadata?.name ?? ''),
      'cache-control': 'private, no-store',
      // Never run as a page of Folio's own, whatever a file claims to be.
      'x-content-type-options': 'nosniff',
      'content-disposition': 'attachment',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}

/** Everything under a course, or under the whole account: gone with what it belonged to. */
export async function removeMedia(bucket: R2Bucket | undefined, userId: string, courseId?: string): Promise<void> {
  if (!bucket) return;
  const keys = (await all(bucket, courseId ? `${userId}/${courseId}/` : `${userId}/`)).map((o) => o.key);
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
}

const say = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** /api/courses/<id>/media and /api/courses/<id>/media/<mediaId>. Without a bucket bound, the account keeps no media. */
export async function courseMedia(request: Request, env: Env, user: User, courseId: string, id: string | undefined): Promise<Response> {
  const bucket = env.MEDIA;
  if (!bucket) return say(501, { type: 'no-media-store' });
  if (id === undefined) return request.method === 'GET' ? say(200, { media: await listMedia(bucket, user.id, courseId) }) : say(405, { type: 'method' });
  if (!MEDIA_ID.test(id)) return say(400, { type: 'bad-media-id' });
  if (request.method === 'GET') return (await getMedia(bucket, user.id, courseId, id)) ?? say(404, { type: 'not-found' });
  if (request.method === 'PUT') {
    const length = Number(request.headers.get('content-length') ?? '0');
    if (length > MAX_MEDIA_BYTES) return say(413, { type: 'too-large' });
    const name = decodeURIComponent(request.headers.get('x-folio-name') ?? '').slice(0, 200);
    const result = await putMedia(bucket, user.id, courseId, id, await request.arrayBuffer(), request.headers.get('content-type') ?? '', name);
    return result === 'ok' ? say(200, { ok: true }) : say(result === 'too-large' ? 413 : 507, { type: result });
  }
  return say(405, { type: 'method' });
}

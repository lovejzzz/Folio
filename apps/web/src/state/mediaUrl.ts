import { isLocalMedia, localMediaId } from '@folio/core';
import { useEffect, useState } from 'react';
import { getMedia } from './media';

/**
 * Where a picture, clip or file can be loaded from. A path is its own address. Something kept on this device
 * is read once and given one address, shared by every place on the page that shows it and let go when the
 * last of them leaves, so nothing is read twice and nothing is left held.
 */
export interface MediaUrl {
  url?: string;
  /** `missing`: the course names it, and this device does not have it (it was added on another). */
  state: 'ready' | 'loading' | 'missing';
  /** The name the file had when it was added. */
  name?: string;
}

interface Held {
  users: number;
  loaded: Promise<MediaUrl>;
  url?: string;
}

const held = new Map<string, Held>();

function acquire(courseId: string, id: string): Held {
  const key = `${courseId}:${id}`;
  let entry = held.get(key);
  if (!entry) {
    const made: Held = { users: 0, loaded: Promise.resolve({ state: 'missing' }) };
    made.loaded = getMedia(courseId, id).then(
      (row): MediaUrl => {
        // Everyone left while it was being read: there is no one to hold an address for.
        if (!row || held.get(key) !== made) return { state: 'missing' };
        made.url = URL.createObjectURL(row.blob);
        return { state: 'ready', url: made.url, name: row.name };
      },
      (): MediaUrl => ({ state: 'missing' }),
    );
    held.set(key, made);
    entry = made;
  }
  entry.users += 1;
  return entry;
}

function release(courseId: string, id: string, entry: Held): void {
  entry.users -= 1;
  const key = `${courseId}:${id}`;
  if (entry.users > 0 || held.get(key) !== entry) return;
  held.delete(key);
  if (entry.url) URL.revokeObjectURL(entry.url);
}

/** How many addresses are held right now: for tests. */
export const heldMediaCount = (): number => held.size;

const LOADING: MediaUrl = { state: 'loading' };

export function useMediaUrl(courseId: string | undefined, ref: string): MediaUrl {
  const id = courseId ? localMediaId(ref) : null;
  const [found, setFound] = useState<{ ref: string; media: MediaUrl } | null>(null);
  useEffect(() => {
    if (!courseId || !id) return;
    let live = true;
    const entry = acquire(courseId, id);
    void entry.loaded.then((media) => live && setFound({ ref, media }));
    return () => {
      live = false;
      release(courseId, id, entry);
    };
  }, [courseId, id, ref]);
  if (!ref) return { state: 'missing' };
  if (!isLocalMedia(ref)) return { state: 'ready', url: ref };
  if (!courseId) return { state: 'missing' };
  // What was found for another reference is not this one's: it shows as loading until its own arrives.
  return found?.ref === ref ? found.media : LOADING;
}

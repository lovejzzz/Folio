import type { Course, HistoryEntry, Source } from '@folio/core';

/**
 * A course's attached files are most of its size, and their text never changes once added. So where a course
 * is stored or sent, the text is taken out ("dried") and kept apart, once per source, and put back ("wetted")
 * where it is read. Everywhere else, and everything in memory, sees the whole course: these are the only two
 * places the shapes differ.
 */

/** A source whose text is kept apart. Only on disk and on the wire; never in a course in memory. */
export interface StoredSource extends Source {
  stored: true;
}

export type Texts = Record<string, string>;

/** The text was meant to be kept apart and isn't there: the course must not open with its files silently empty. */
export class MissingTextError extends Error {
  constructor(readonly sourceIds: string[]) {
    super(`The text of ${sourceIds.length === 1 ? 'an attached file' : `${sourceIds.length} attached files`} is missing.`);
    this.name = 'MissingTextError';
  }
}

const isSource = (v: unknown): v is Source =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Source).id === 'string' &&
  typeof (v as Source).text === 'string' &&
  Array.isArray((v as Source).passages) &&
  ((v as Source).kind === 'text' || (v as Source).kind === 'file');

const isStored = (v: unknown): v is StoredSource => isSource(v) && (v as StoredSource).stored === true;

/** A copy of `value` with every source in it dried, and the texts taken out. Untouched parts are shared. */
function dryValue(value: unknown, texts: Texts): unknown {
  if (isSource(value)) {
    if (isStored(value)) return value;
    texts[value.id] = value.text;
    return { ...value, text: '', stored: true } satisfies StoredSource;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const d = dryValue(v, texts);
      changed ||= d !== v;
      return d;
    });
    return changed ? out : value;
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = dryValue(v, texts);
      changed ||= out[k] !== v;
    }
    return changed ? out : value;
  }
  return value;
}

function wetValue(value: unknown, texts: Texts, missing: Set<string>): unknown {
  if (isStored(value)) {
    const text = texts[value.id];
    if (text === undefined) {
      missing.add(value.id);
      return value;
    }
    const { stored: _stored, ...source } = value;
    return { ...source, text };
  }
  if (Array.isArray(value)) return value.map((v) => wetValue(v, texts, missing));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, wetValue(v, texts, missing)]));
  return value;
}

function wet<T>(value: T, texts: Texts): T {
  const missing = new Set<string>();
  const out = wetValue(value, texts, missing) as T;
  if (missing.size) throw new MissingTextError([...missing]);
  return out;
}

/** The course with its sources' text taken out, and those texts by source ID. */
export function dryCourse(course: Course): { body: Course; texts: Texts } {
  const texts: Texts = {};
  const sources = Object.fromEntries(Object.entries(course.sources).map(([id, s]) => [id, dryValue(s, texts) as Source]));
  return { body: { ...course, sources }, texts };
}

/** The whole course again. A course stored before texts were kept apart has none dried, and comes back as it is. */
export function wetCourse(body: Course, texts: Texts): Course {
  if (!Object.values(body.sources).some(isStored)) return body;
  return { ...body, sources: wet(body.sources, texts) };
}

/** A history entry with the sources in it (a file added or removed) dried; most entries have none and come back as they are. */
export function dryEntry(entry: HistoryEntry): { entry: HistoryEntry; texts: Texts } {
  const texts: Texts = {};
  return { entry: dryValue(entry, texts) as HistoryEntry, texts };
}

export function wetEntry(entry: HistoryEntry, texts: Texts): HistoryEntry {
  return wet(entry, texts);
}

/** The source IDs whose text a dried value needs. */
export function neededTexts(value: unknown, into = new Set<string>()): Set<string> {
  if (isStored(value)) into.add(value.id);
  else if (Array.isArray(value)) for (const v of value) neededTexts(v, into);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) neededTexts(v, into);
  return into;
}

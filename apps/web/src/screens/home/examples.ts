/**
 * The example briefs under the composer: one for elementary school, one for middle or high school and one
 * for college, picked afresh on every visit, and never the ones shown last time. Each writes a model brief
 * into the box (exampleBriefs.ts).
 */

export const BANDS = ['elementary', 'secondary', 'university'] as const;
export type Band = (typeof BANDS)[number];
export type ExampleLibrary = Record<Band, readonly string[]>;

const LAST_SHOWN = 'folio.examples';

/** One example from each band, youngest first, avoiding the last ones shown where a band has others. */
export function pickExamples(library: ExampleLibrary, last: readonly string[], random: () => number = Math.random): string[] {
  return BANDS.map((band) => {
    const fresh = library[band].filter((e) => !last.includes(e));
    const pool = fresh.length ? fresh : library[band];
    return pool[Math.floor(random() * pool.length)]!;
  });
}

/** This visit's examples. Remembering the last ones is a convenience: without storage, they are simply random. */
export function examplesForThisVisit(library: ExampleLibrary): string[] {
  let last: string[] = [];
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(LAST_SHOWN) ?? '[]');
    if (Array.isArray(saved)) last = saved.filter((e): e is string => typeof e === 'string');
  } catch {
    // Unreadable or blocked storage: pick without it.
  }
  const picked = pickExamples(library, last);
  try {
    localStorage.setItem(LAST_SHOWN, JSON.stringify(picked));
  } catch {
    // Blocked storage: next visit may repeat one, which is harmless.
  }
  return picked;
}

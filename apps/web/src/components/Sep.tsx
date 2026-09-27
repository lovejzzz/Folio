/**
 * The "·" between short facts ("Year 7 · 4 lessons · 50 min"). Instrument
 * Sans has a narrow word space, so the dot gets its own margins.
 */
export function Sep() {
  return (
    <span aria-hidden className="mx-1.5 text-ink-3">
      ·
    </span>
  );
}

import { lazy, Suspense, useState } from 'react';
import { tourText } from './tourText';

const TourDialog = lazy(() => import('./TourDialog'));

/**
 * The film of Folio making three courses, offered under the examples: a small cover and two lines, in the first screen
 * and quieter than the box a course is described in. Nothing comes from YouTube until it is pressed: the cover is the
 * site's own picture, and the player is loaded with the dialog that holds it.
 */
export default function TourCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 flex items-center gap-3.5 rounded-control border border-rule bg-paper p-2 pr-5 text-left outline-none transition-colors duration-120 hover:border-field focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="relative block aspect-video w-32 shrink-0 overflow-hidden rounded-md">
          <img src="/tour/poster.webp" alt="" width={640} height={360} className="h-full w-full object-cover" />
          <span aria-hidden className="absolute inset-0 grid place-items-center">
            <span className="grid size-8 place-items-center rounded-full bg-ink/80">
              <svg width="12" height="12" viewBox="0 0 12 12" className="ml-0.5 fill-paper">
                <path d="M2 1.2v9.6L10.4 6z" />
              </svg>
            </span>
          </span>
        </span>
        <span className="font-ui">
          <span className="block text-15 text-ink">{tourText.label}</span>
          <span className="block text-13 text-ink-2">{tourText.length}</span>
        </span>
      </button>
      {open && (
        <Suspense fallback={null}>
          <TourDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

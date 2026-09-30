import { cx } from '../cx';
import { MARK_ANGLES, MARK_PAGE, markTransform } from './mark';

const PAGE_FILLS = ['fill-mark-back', 'fill-mark-mid', 'fill-accent'] as const;

/**
 * The mark: three pages of a course fanned out, the front one in the accent blue. Each page is edged in the
 * desk colour, so the pages stay apart down to 16 px.
 */
export function FolioMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      {MARK_ANGLES.map((angle, i) => (
        <rect key={angle} {...MARK_PAGE} transform={markTransform(angle)} className={cx(PAGE_FILLS[i], 'stroke-desk')} strokeWidth="1.5" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/**
 * The wordmark: "folio" in lowercase Instrument Serif. The dot of the i is a
 * small ink drop in the accent blue.
 */
export function Wordmark({ className, label = 'Folio' }: { className?: string; label?: string }) {
  return (
    <span className={cx('relative inline-flex items-baseline font-display leading-none text-ink', className)} aria-label={label} role="img">
      <span aria-hidden>fol</span>
      <span aria-hidden className="relative">
        ı
        <svg
          viewBox="0 0 10 14"
          aria-hidden
          className="absolute left-1/2 top-0 -translate-x-1/2 fill-accent"
          style={{ height: '0.24em', width: '0.175em', marginTop: '0.075em' }}
        >
          <path d="M5 0C5 0 0.6 6.2 0.6 9.2a4.4 4.4 0 0 0 8.8 0C9.4 6.2 5 0 5 0z" />
        </svg>
      </span>
      <span aria-hidden>o</span>
    </span>
  );
}

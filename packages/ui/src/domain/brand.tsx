import { cx } from '../cx';

/**
 * The mark: a sheet with a folded corner and one binder tab on its right
 * edge. Drawn to stay legible at 16 px.
 */
export function FolioMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <rect x="14.5" y="9.75" width="7" height="6" rx="1.25" className="fill-accent" />
      <path
        d="M3.25 2.75h9.25l4.5 4.5v14H3.25z"
        className="fill-paper stroke-ink"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12.5 2.75v4.5H17" className="fill-none stroke-ink" strokeWidth="1.5" strokeLinejoin="round" />
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

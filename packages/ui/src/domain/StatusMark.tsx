import { cx } from '../cx';

export type StatusKind = 'attention' | 'stale' | 'building' | 'error' | 'saved';

/**
 * One status mark: a shape and a colour, with a text label for screen
 * readers, so status never depends on colour alone.
 */
export function StatusMark({ kind, label, className }: { kind: StatusKind; label: string; className?: string }) {
  return (
    <span className={cx('inline-flex size-3 shrink-0 items-center justify-center', className)} role="img" aria-label={label}>
      {kind === 'attention' && <span className="size-2 rotate-45 bg-attention" />}
      {kind === 'stale' && <span className="size-2.5 rounded-full border-2 border-ink-2" />}
      {kind === 'building' && <span className="size-2 animate-pulse-soft rounded-full bg-accent" />}
      {kind === 'saved' && <span className="size-1.5 rounded-full bg-good" />}
      {kind === 'error' && (
        <svg viewBox="0 0 10 10" className="size-2.5 fill-critical" aria-hidden>
          <path d="M5 .5 9.6 9.2H.4z" />
        </svg>
      )}
    </span>
  );
}

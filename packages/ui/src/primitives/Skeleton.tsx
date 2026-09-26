import { cx } from '../cx';

/** A placeholder shaped like the content it stands in for. Never a spinner. */
export function Skeleton({ className, lines = 1 }: { className?: string; lines?: number }) {
  return (
    <span aria-hidden className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className={cx('block h-3 animate-shimmer rounded-full bg-well', i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full', className)}
        />
      ))}
    </span>
  );
}

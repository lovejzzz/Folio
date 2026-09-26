import type { ReactNode } from 'react';
import { cx } from '../cx';

/**
 * The paper surface every document sits on: print-accurate width, generous
 * margins and a running header. What you see on the sheet is what prints.
 */
export function Sheet({
  children,
  running,
  className,
  lang,
}: {
  children: ReactNode;
  running?: ReactNode;
  className?: string;
  lang?: string;
}) {
  return (
    <article lang={lang} className={cx('folio-sheet mx-auto w-full max-w-sheet rounded-sheet bg-paper shadow-sheet', className)}>
      {running && (
        <div className="flex items-center justify-between gap-4 px-5 pt-5 font-ui text-12 text-ink-2 md:px-16 md:pt-8 print:px-0">
          {running}
        </div>
      )}
      <div className="px-5 pb-12 pt-6 md:px-16 md:pb-20 md:pt-10 print:px-0">{children}</div>
    </article>
  );
}

/** An AI proposal: marker-highlighted until the teacher accepts or rejects it. */
export function Highlight({ children, className }: { children: ReactNode; className?: string }) {
  return <mark className={cx('folio-highlight', className)}>{children}</mark>;
}

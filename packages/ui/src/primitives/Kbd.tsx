import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-control border border-rule bg-well px-1 font-mono text-12 text-ink-2 tabular-nums">
      {children}
    </kbd>
  );
}

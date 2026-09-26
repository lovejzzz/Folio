import type { MaterialKind } from '@folio/core';
import type { ReactNode } from 'react';
import { cx } from '../cx';
import { MaterialIcon } from './MaterialIcon';

/** Material identity: the tab colour, its icon and its name. Colour is never used for the text. */
export function BinderTab({
  kind,
  label,
  meta,
  size = 'md',
  className,
}: {
  kind: MaterialKind;
  label: ReactNode;
  meta?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-2 font-ui', size === 'sm' ? 'text-13' : 'text-14', className)}>
      <span aria-hidden className={cx('h-4 w-1 shrink-0 rounded-full', tabBg[kind])} />
      <MaterialIcon kind={kind} size={size === 'sm' ? 16 : 18} className="shrink-0 text-ink-2" />
      <span className="truncate font-medium text-ink">{label}</span>
      {meta !== undefined && <span className="shrink-0 text-ink-2 tabular-nums">{meta}</span>}
    </span>
  );
}

/** Static class names so Tailwind can see every tab colour. */
export const tabBg: Record<MaterialKind, string> = {
  map: 'bg-tab-map',
  syllabus: 'bg-tab-syllabus',
  plan: 'bg-tab-plan',
  slides: 'bg-tab-slides',
  assignments: 'bg-tab-assignments',
  rubrics: 'bg-tab-rubrics',
  discussions: 'bg-tab-discussions',
  quiz: 'bg-tab-quiz',
  study: 'bg-tab-study',
  faq: 'bg-tab-faq',
};

export const tabBorder: Record<MaterialKind, string> = {
  map: 'border-tab-map',
  syllabus: 'border-tab-syllabus',
  plan: 'border-tab-plan',
  slides: 'border-tab-slides',
  assignments: 'border-tab-assignments',
  rubrics: 'border-tab-rubrics',
  discussions: 'border-tab-discussions',
  quiz: 'border-tab-quiz',
  study: 'border-tab-study',
  faq: 'border-tab-faq',
};

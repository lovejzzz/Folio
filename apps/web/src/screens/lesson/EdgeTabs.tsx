import type { MaterialKind } from '@folio/core';
import { MaterialIcon, Tooltip, cx, tabBg } from '@folio/ui';
import { useT } from '../../i18n';

/** Binder tabs on the sheet's right edge: one per material, each jumps to its section. */
export function EdgeTabs({ kinds, active }: { kinds: MaterialKind[]; active: MaterialKind | null }) {
  const t = useT();
  return (
    <nav aria-label={t.lesson.jumpTo} className="no-print sticky top-24 hidden flex-col gap-1.5 xl:flex">
      {kinds.map((kind) => (
        <Tooltip key={kind} content={t.materialOne[kind]} delay={200}>
          <a
            href={`#m-${kind}`}
            aria-label={t.materialOne[kind]}
            aria-current={active === kind ? 'location' : undefined}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`m-${kind}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className={cx(
              'relative flex h-10 items-center rounded-r-control bg-paper pl-2 pr-2.5 text-ink-2 shadow-sheet outline-none transition-transform duration-200 ease-ink hover:translate-x-0.5 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent',
              active === kind ? 'translate-x-1 text-ink' : '-translate-x-1',
            )}
          >
            <span aria-hidden className={cx('absolute inset-y-1.5 right-0 w-1 rounded-l-full', tabBg[kind])} />
            <MaterialIcon kind={kind} size={16} />
          </a>
        </Tooltip>
      ))}
    </nav>
  );
}

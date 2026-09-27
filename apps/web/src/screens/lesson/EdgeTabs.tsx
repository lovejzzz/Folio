import type { MaterialKind } from '@folio/core';
import { MaterialIcon, cx, tabBg } from '@folio/ui';
import { useT } from '../../i18n';

/**
 * Binder tabs on the sheet's right edge: one per material, each jumps to its
 * section. Each is named on the tab: eight icons alone had teachers hovering
 * to find the quiz.
 */
export function EdgeTabs({ kinds, active }: { kinds: MaterialKind[]; active: MaterialKind | null }) {
  const t = useT();
  return (
    <nav aria-label={t.lesson.jumpTo} className="no-print sticky top-24 hidden flex-col gap-1.5 xl:flex">
      {kinds.map((kind) => (
        <a
          key={kind}
          href={`#m-${kind}`}
          aria-current={active === kind ? 'location' : undefined}
          onClick={(e) => {
            e.preventDefault();
            // Focus follows the jump, so a keyboard reader continues from the section; motion only if it's welcome.
            const target = document.getElementById(`m-${kind}`);
            if (!target) return;
            const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
          }}
          className={cx(
            'relative flex h-9 items-center gap-2 whitespace-nowrap rounded-r-control bg-paper pl-2.5 pr-4 font-ui text-12 shadow-sheet outline-none transition-transform duration-200 ease-ink hover:translate-x-0.5 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent',
            active === kind ? 'translate-x-1 font-medium text-ink' : '-translate-x-1 text-ink-2',
          )}
        >
          <span aria-hidden className={cx('absolute inset-y-1.5 right-0 w-1 rounded-l-full', tabBg[kind])} />
          <MaterialIcon kind={kind} size={15} className="shrink-0" />
          {t.materialOne[kind]}
        </a>
      ))}
    </nav>
  );
}

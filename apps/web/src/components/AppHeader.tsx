import { Link } from '@tanstack/react-router';
import { FolioMark, Wordmark, cx } from '@folio/ui';
import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { AccountButton } from './AccountButton';

const navLink =
  'rounded-control px-2.5 py-1.5 font-ui text-14 text-ink-2 outline-none transition-colors duration-120 hover:bg-well hover:text-ink focus-visible:ring-2 focus-visible:ring-accent';

export function HomeLink({ compact = false }: { compact?: boolean }) {
  const t = useT();
  return (
    <Link
      to="/"
      className="group flex shrink-0 items-center gap-2 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-desk"
      aria-label={t.nav.home}
    >
      <FolioMark size={compact ? 22 : 24} />
      {!compact && <Wordmark className="text-28" label={t.appName} />}
    </Link>
  );
}

/** Header for the places outside a course: home, library, settings. */
export function SimpleHeader({ children }: { children?: ReactNode }) {
  const t = useT();
  return (
    <header className="no-print flex h-16 items-center justify-between gap-4 px-5 md:px-8">
      <HomeLink />
      <nav aria-label={t.appName} className="flex items-center gap-1">
        {children}
        <Link to="/library" className={navLink} activeProps={{ className: 'text-ink bg-well' }}>
          {t.nav.library}
        </Link>
        <Link to="/settings" className={navLink} activeProps={{ className: 'text-ink bg-well' }}>
          {t.nav.settings}
        </Link>
        <span className="ml-2 flex">
          <AccountButton />
        </span>
      </nav>
    </header>
  );
}

export function HeaderDivider({ className }: { className?: string }) {
  return <span aria-hidden className={cx('h-5 w-px shrink-0 bg-rule-strong', className)} />;
}

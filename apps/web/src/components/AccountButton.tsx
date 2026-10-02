import { cx } from '@folio/ui';
import { lazy, Suspense } from 'react';
import { useT } from '../i18n';
import { googleClientId } from '../lib/googlePath';
import { signIn, useAccount, type AccountUser, type SyncState } from '../state/account';

/** The account card loads only for someone signed in. */
const AccountMenu = lazy(() => import('./AccountMenu').then((m) => ({ default: m.AccountMenu })));

/* eslint-disable no-restricted-syntax -- Google's mark keeps its own colours, as its brand rules require. */
function GoogleG() {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
/* eslint-enable no-restricted-syntax */

const initial = (user: AccountUser) => (user.name || user.email).trim().charAt(0).toUpperCase() || '·';

/** A round mark with the teacher's initial; a small dot says when their courses are on their way to the account. */
export function AvatarMark({ user, sync = 'idle', large = false }: { user: AccountUser; sync?: SyncState; large?: boolean }) {
  return (
    <span className={cx('relative flex shrink-0 items-center justify-center rounded-full bg-accent-tint font-ui font-semibold text-accent', large ? 'size-10 text-16' : 'size-8 text-14')}>
      {initial(user)}
      {sync !== 'idle' && (
        <span
          aria-hidden
          className={cx('absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-desk', sync === 'syncing' ? 'animate-pulse-soft bg-accent' : sync === 'offline' ? 'bg-ink-3' : 'bg-attention')}
        />
      )}
    </span>
  );
}

export const avatarButtonClass =
  'shrink-0 rounded-full outline-none ring-offset-2 ring-offset-desk transition-shadow duration-120 data-hovered:ring-2 data-hovered:ring-rule-strong data-focus-visible:ring-2 data-focus-visible:ring-accent';

/** Top right on every page: "Sign in", or the signed-in teacher's mark. Hidden where Google sign-in isn't set up. */
export function AccountButton({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const user = useAccount((s) => s.user);
  if (!googleClientId()) return null;
  if (!user) {
    return (
      <button
        type="button"
        onClick={signIn}
        className={cx(
          'flex h-8 shrink-0 items-center gap-2 rounded-full border border-rule bg-paper font-ui text-13 font-medium text-ink outline-none transition-colors duration-120 hover:border-field focus-visible:ring-2 focus-visible:ring-accent',
          compact ? 'px-2.5' : 'px-3.5',
        )}
      >
        <GoogleG />
        {t.account.signIn}
      </button>
    );
  }
  return (
    <Suspense fallback={<AvatarMark user={user} />}>
      <AccountMenu user={user} />
    </Suspense>
  );
}

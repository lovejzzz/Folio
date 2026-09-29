import { accountText } from '../state/accountText';
import { Button, Dialog, popoverClass } from '@folio/ui';
import { Link } from '@tanstack/react-router';
import { LogOut, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button as AriaButton, Dialog as AriaDialog, DialogTrigger, Popover } from 'react-aria-components';
import { useT } from '../i18n';
import { creditsText, refreshCredits, useCredits } from '../state/credits';
import { signOut, useAccount, type AccountUser, type SyncState } from '../state/account';
import { AvatarMark, avatarButtonClass } from './AccountButton';

export function syncLine(sync: SyncState, lastSynced: number | null): string {
  if (sync === 'syncing') return accountText.syncing;
  if (sync === 'offline') return accountText.offline;
  if (sync === 'error') return accountText.syncError;
  if (!lastSynced) return accountText.syncing;
  const minutes = Math.floor((Date.now() - lastSynced) / 60_000);
  return accountText.synced(minutes < 1 ? accountText.justNow : accountText.minutesAgo(minutes));
}

/** The balance, once the server has said it; nothing where credits aren't in use. */
function CreditsLine() {
  const { balance, available } = useCredits();
  useEffect(() => {
    void refreshCredits();
  }, []);
  if (balance === null || !available) return null;
  return <p className="mx-1 mt-1 px-3 font-ui text-12 text-ink-2">{creditsText.balance(balance)}</p>;
}

/** Signing out asks first, and says so plainly when changes here haven't reached the account yet. */
export function SignOutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [unsent, setUnsent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (force: boolean) => {
    setBusy(true);
    const left = force ? 0 : await (await import('../state/sync')).unsent();
    if (left > 0) {
      setUnsent(left);
      setBusy(false);
      return;
    }
    await signOut();
    setBusy(false);
    onClose();
  };
  return (
    <Dialog isOpen={open} onOpenChange={(o) => !o && onClose()} title={accountText.signOutTitle} size="sm">
      <p className="px-6 pt-3 font-ui text-14 leading-relaxed text-ink-2">{unsent ? accountText.signOutUnsent(unsent) : accountText.signOutBody}</p>
      <div className="flex justify-end gap-2 px-6 pb-5 pt-6">
        <Button variant="quiet" onPress={onClose}>
          {accountText.cancel}
        </Button>
        <Button variant={unsent ? 'destructive' : 'primary'} isDisabled={busy} onPress={() => void go(Boolean(unsent))}>
          {unsent ? accountText.signOutAnyway : accountText.signOut}
        </Button>
      </div>
    </Dialog>
  );
}

/** The signed-in teacher's card: who they are, whether their courses are in the account, and signing out. */
export function AccountMenu({ user }: { user: AccountUser }) {
  const t = useT();
  const sync = useAccount((s) => s.sync);
  const lastSynced = useAccount((s) => s.lastSynced);
  const [leaving, setLeaving] = useState(false);
  return (
    <>
      <DialogTrigger>
        <AriaButton aria-label={`${t.account.menu}: ${user.email}`} className={avatarButtonClass}>
          <AvatarMark user={user} sync={sync} />
        </AriaButton>
        <Popover placement="bottom end" offset={8} className={popoverClass}>
          <AriaDialog aria-label={t.account.menu} className="w-72 outline-none">
            {({ close }) => (
              <>
                <div className="flex items-center gap-3 px-3 pb-3 pt-2.5">
                  <AvatarMark user={user} large />
                  <div className="min-w-0">
                    {user.name && <p className="truncate font-ui text-14 font-medium text-ink">{user.name}</p>}
                    <p className="truncate font-ui text-13 text-ink-2">{user.email}</p>
                  </div>
                </div>
                <p role="status" className="mx-1 rounded-control bg-well px-3 py-2 font-ui text-12 leading-5 text-ink-2">
                  {syncLine(sync, lastSynced)}
                </p>
                <CreditsLine />
                <div className="mt-1 border-t border-rule pt-1">
                  <Link to="/settings" onClick={close} className="flex h-8 items-center gap-2.5 rounded-control px-2.5 font-ui text-14 text-ink outline-none hover:bg-well focus-visible:bg-well">
                    <SettingsIcon size={15} strokeWidth={1.75} className="text-ink-2" aria-hidden />
                    {t.nav.settings}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      setLeaving(true);
                    }}
                    className="flex h-8 w-full items-center gap-2.5 rounded-control px-2.5 text-left font-ui text-14 text-ink outline-none hover:bg-well focus-visible:bg-well"
                  >
                    <LogOut size={15} strokeWidth={1.75} className="text-ink-2" aria-hidden />
                    {accountText.signOut}
                  </button>
                </div>
              </>
            )}
          </AriaDialog>
        </Popover>
      </DialogTrigger>
      <SignOutDialog open={leaving} onClose={() => setLeaving(false)} />
    </>
  );
}

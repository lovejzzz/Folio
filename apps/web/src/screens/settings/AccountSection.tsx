import { accountText } from '../../state/accountText';
import { Button, Dialog } from '@folio/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { creditsText, refreshCredits, useCredits } from '../../state/credits';
import { SignOutDialog, syncLine } from '../../components/AccountMenu';
import { googleClientId } from '../../lib/googlePath';
import { deleteAccount, signIn, useAccount } from '../../state/account';
import { toast } from '../../state/toasts';

/** Credits left in the account, said before it is deleted: they end with it. */
function CreditsLost({ open }: { open: boolean }) {
  const balance = useCredits((s) => s.balance);
  const failed = useCredits((s) => s.failed);
  useEffect(() => {
    if (open) void refreshCredits();
  }, [open]);
  if (balance === null && !failed) return null;
  // Unknown is not none: when the balance couldn't be had, the warning is given without the number.
  const known = balance !== null && !failed;
  if (known && balance <= 0) return null;
  return (
    <p role="alert" className="mx-6 mt-3 rounded-control bg-critical-tint px-3 py-2 font-ui text-13 leading-relaxed text-critical">
      {known ? creditsText.lostOnDelete(balance) : creditsText.mayBeLost}
    </p>
  );
}

function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await deleteAccount();
      toast({ message: accountText.deleted });
      onClose();
    } catch {
      toast({ message: accountText.syncError, tone: 'critical' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog isOpen={open} onOpenChange={(o) => !o && onClose()} title={accountText.deleteTitle} size="sm">
      <p className="px-6 pt-3 font-ui text-14 leading-relaxed text-ink-2">{accountText.deleteBody}</p>
      <CreditsLost open={open} />
      <div className="flex justify-end gap-2 px-6 pb-5 pt-6">
        <Button variant="quiet" onPress={onClose}>
          {accountText.cancel}
        </Button>
        <Button variant="destructive" isDisabled={busy} onPress={() => void remove()}>
          {accountText.deleteConfirm}
        </Button>
      </div>
    </Dialog>
  );
}

/** Signed in or not, and what that means for the courses; the way out of the account, and out of Folio. */
export function AccountSection({ Section }: { Section: (props: { title: string; lede?: string; children: ReactNode }) => ReactNode }) {
  const user = useAccount((s) => s.user);
  const sync = useAccount((s) => s.sync);
  const lastSynced = useAccount((s) => s.lastSynced);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!googleClientId()) return null;
  return (
    <Section title={accountText.section} lede={accountText.lede}>
      {user ? (
        <>
          <p className="font-ui text-14 text-ink">{accountText.signedInAs(user.email)}</p>
          <p className="mt-1 font-ui text-13 text-ink-2">{syncLine(sync, lastSynced)}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onPress={() => setLeaving(true)}>{accountText.signOut}</Button>
            <Button variant="quiet" className="text-critical" onPress={() => setDeleting(true)}>
              {accountText.deleteAccount}
            </Button>
          </div>
          <SignOutDialog open={leaving} onClose={() => setLeaving(false)} />
          <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
        </>
      ) : (
        <>
          <p className="font-ui text-14 text-ink-2">{accountText.signedOutLede}</p>
          <Button className="mt-4" variant="primary" onPress={signIn}>
            {accountText.signInWithGoogle}
          </Button>
        </>
      )}
    </Section>
  );
}

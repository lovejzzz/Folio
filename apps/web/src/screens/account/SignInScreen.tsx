import { accountText } from '../../state/accountText';
import { Button } from '@folio/ui';
import { useEffect, useRef, useState } from 'react';
import { Message, linkClass } from '../../app/errors';
import { usePageTitle } from '../../app/usePageTitle';
import { SimpleHeader } from '../../components/AppHeader';
import { googleClientId } from '../../lib/googlePath';
import { useT } from '../../i18n';
import { finishSignIn, safeReturn, startSignIn } from '../../lib/googleSignIn';
import { announce, markJustSignedIn, SIGN_IN_WINDOW, writeHint, type AccountUser } from '../../state/account';

type Step = { kind: 'going' | 'finishing' | 'done' } | { kind: 'failed'; message: string; popup: boolean };

function returnTo(): string {
  return safeReturn(new URLSearchParams(window.location.search).get('return'), window.location.origin);
}

const post = (path: string, body?: unknown) =>
  fetch(`/api/${path}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-folio': '1' }, ...(body ? { body: JSON.stringify(body) } : {}) });

/** The nonce for this sign-in, from Folio's server, which keeps it in this browser's cookie. */
async function askNonce(): Promise<string | null> {
  const res = await post('session/nonce');
  return res.ok ? ((await res.json()) as { nonce: string }).nonce : null;
}

/** Hand Google's ID token to Folio's server, which checks it and starts the session. */
async function complete(idToken: string): Promise<AccountUser | null> {
  const res = await post('session', { idToken });
  if (!res.ok) return null;
  return ((await res.json()) as { user: AccountUser }).user;
}

/** Arriving: back from Google, finish; otherwise go to Google. Resolves only with what to show. */
async function arrive(): Promise<Step> {
  const reply = finishSignIn(window.location.hash);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  if (!reply) {
    const clientId = googleClientId();
    if (!clientId) return { kind: 'failed', message: accountText.unavailable, popup: false };
    const popup = window.name === SIGN_IN_WINDOW;
    const nonce = await askNonce().catch(() => null);
    if (!nonce) return { kind: 'failed', message: accountText.failed, popup };
    window.location.assign(startSignIn(clientId, window.location.origin, returnTo(), popup, nonce));
    return new Promise<never>(() => {});
  }
  if ('error' in reply) return { kind: 'failed', message: reply.error === 'cancelled' ? accountText.cancelled : accountText.failed, popup: reply.popup };
  const user = await complete(reply.idToken).catch(() => null);
  if (!user) return { kind: 'failed', message: accountText.failed, popup: reply.popup };
  writeHint(user);
  announce({ type: 'signed-in', user });
  if (reply.popup) {
    // The page that asked has been told; this window's work is done. Where a browser won't let it close, it says so.
    window.close();
    return { kind: 'done' };
  }
  markJustSignedIn();
  // Checked again on the way out: what was remembered sat in this tab's storage in between.
  window.location.replace(safeReturn(reply.returnTo, window.location.origin));
  return new Promise<never>(() => {});
}

/** The page Google sends the teacher back to; in the small sign-in window, or in the tab when pop-ups are blocked. */
export function SignInScreen() {
  const t = useT();
  const [step, setStep] = useState<Step>(() => ({ kind: window.location.hash ? 'finishing' : 'going' }));
  const begun = useRef(false);
  usePageTitle(t.account.signIn);
  useEffect(() => {
    // Strict mode runs this twice; Google's reply can be used only once.
    if (begun.current) return;
    begun.current = true;
    void arrive().then(setStep);
  }, []);
  if (step.kind === 'failed') {
    return (
      <Message
        title={accountText.failedTitle}
        body={step.message}
        action={
          <span className="flex items-center gap-4">
            <Button variant="primary" onPress={() => window.location.assign(`/sign-in?return=${encodeURIComponent(returnTo())}`)}>
              {accountText.tryAgain}
            </Button>
            {!step.popup && (
              <a href="/" className={linkClass}>
                {accountText.backToFolio}
              </a>
            )}
          </span>
        }
      />
    );
  }
  const words = step.kind === 'going' ? accountText.goingToGoogle : step.kind === 'finishing' ? accountText.finishing : accountText.signedIn;
  return (
    <div className="min-h-dvh">
      <SimpleHeader />
      <main id="main" className="mx-auto max-w-md px-5 pt-24 text-center">
        <p role="status" className="font-ui text-16 text-ink-2">
          {words}
        </p>
      </main>
    </div>
  );
}

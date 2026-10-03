import { Outlet } from '@tanstack/react-router';
import { lazy, Suspense, useEffect } from 'react';
import { I18nProvider } from 'react-aria-components';
import { StorageBlocked } from '../components/StorageBlocked';
import { Toaster } from '../components/Toaster';
import { useT } from '../i18n';
import { startAccount, useAccount } from '../state/account';
import { applyTextSize, applyTheme, usePrefs } from '../state/prefs';
import { toast } from '../state/toasts';
import { useUi } from '../state/ui';

/** Loaded only when a model needs connecting, so the first page stays small. */
const ConnectDialog = lazy(() => import('../components/ConnectDialog').then((m) => ({ default: m.ConnectDialog })));
/** Loaded only when someone has just signed in with courses already in this browser. */
const SampleChooser = lazy(() => import('../components/SampleChooser').then((m) => ({ default: m.SampleChooser })));
const OfferDialog = lazy(() => import('../components/OfferDialog').then((m) => ({ default: m.OfferDialog })));

function usePrintInLight(theme: string): void {
  useEffect(() => {
    const before = () => applyTheme('light');
    const after = () => applyTheme(theme as 'system');
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, [theme]);
}

export function RootLayout() {
  const t = useT();
  const theme = usePrefs((s) => s.theme);
  const connecting = useUi((s) => s.connectThen !== null);
  const choosingSample = useUi((s) => s.samplesOpen);
  const offering = useAccount((s) => s.offer.length > 0);
  const textSize = usePrefs((s) => s.textSize);
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => applyTextSize(textSize), [textSize]);
  useEffect(() => startAccount(), []);
  useEffect(() => {
    const offline = () => toast({ message: t.errors.offline, tone: 'attention' });
    window.addEventListener('offline', offline);
    return () => window.removeEventListener('offline', offline);
  }, [t]);
  usePrintInLight(theme);
  return (
    <I18nProvider locale="en-US">
      <a
        href="#main"
        className="no-print sr-only rounded-control bg-paper px-3 py-2 font-ui text-14 text-ink shadow-overlay focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50"
      >
        {t.nav.skip}
      </a>
      <StorageBlocked />
      <Outlet />
      <Toaster />
      {connecting && (
        <Suspense fallback={null}>
          <ConnectDialog />
        </Suspense>
      )}
      {choosingSample && (
        <Suspense fallback={null}>
          <SampleChooser />
        </Suspense>
      )}
      {offering && (
        <Suspense fallback={null}>
          <OfferDialog />
        </Suspense>
      )}
    </I18nProvider>
  );
}

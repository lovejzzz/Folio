import { Outlet } from '@tanstack/react-router';
import { lazy, Suspense, useEffect } from 'react';
import { I18nProvider } from 'react-aria-components';
import { Toaster } from '../components/Toaster';
import { ariaLocale, useT } from '../i18n';
import { applyTheme, usePrefs } from '../state/prefs';
import { toast } from '../state/toasts';
import { useUi } from '../state/ui';

/** Loaded only when a model needs connecting, so the first page stays small. */
const ConnectDialog = lazy(() => import('../components/ConnectDialog').then((m) => ({ default: m.ConnectDialog })));

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
  const uiLanguage = usePrefs((s) => s.uiLanguage);
  const connecting = useUi((s) => s.connectThen !== null);
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    document.documentElement.lang = uiLanguage;
  }, [uiLanguage]);
  useEffect(() => {
    const offline = () => toast({ message: t.errors.offline, tone: 'attention' });
    window.addEventListener('offline', offline);
    return () => window.removeEventListener('offline', offline);
  }, [t]);
  usePrintInLight(theme);
  return (
    <I18nProvider locale={ariaLocale(uiLanguage)}>
      <a
        href="#main"
        className="no-print sr-only rounded-control bg-paper px-3 py-2 font-ui text-14 text-ink shadow-overlay focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50"
      >
        {t.nav.skip}
      </a>
      <Outlet />
      <Toaster />
      {connecting && (
        <Suspense fallback={null}>
          <ConnectDialog />
        </Suspense>
      )}
    </I18nProvider>
  );
}

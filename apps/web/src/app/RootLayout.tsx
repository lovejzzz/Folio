import { Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ConnectDialog } from '../components/ConnectDialog';
import { Toaster } from '../components/Toaster';
import { useT } from '../i18n';
import { redo, undo } from '../state/edit';
import { applyTheme, usePrefs } from '../state/prefs';
import { activeStore } from '../state/session';
import { toast } from '../state/toasts';
import { useUi } from '../state/ui';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'));
}

function useGlobalKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        if (!activeStore()) return;
        e.preventDefault();
        useUi.getState().setCommandOpen(!useUi.getState().commandOpen);
        return;
      }
      if (!mod || isTyping(e.target) || !activeStore()) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

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
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    document.documentElement.lang = uiLanguage;
  }, [uiLanguage]);
  useEffect(() => {
    const offline = () => toast({ message: t.errors.offline, tone: 'attention' });
    window.addEventListener('offline', offline);
    return () => window.removeEventListener('offline', offline);
  }, [t]);
  useGlobalKeys();
  usePrintInLight(theme);
  return (
    <>
      <a
        href="#main"
        className="no-print sr-only rounded-control bg-paper px-3 py-2 font-ui text-14 text-ink shadow-overlay focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50"
      >
        {t.nav.skip}
      </a>
      <Outlet />
      <Toaster />
      <ConnectDialog />
    </>
  );
}

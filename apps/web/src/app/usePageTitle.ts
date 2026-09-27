import { useEffect } from 'react';
import { useT } from '../i18n';

/**
 * Names the browser tab after what is on screen, most specific part first:
 * "Light and leaves · How plants make food · Folio". Empty parts are skipped.
 */
export function usePageTitle(...parts: (string | null | undefined)[]): void {
  const t = useT();
  const title = t.pageTitle(parts.filter((p): p is string => Boolean(p?.trim())));
  const fallback = t.pageTitle([]);
  useEffect(() => {
    document.title = title;
    return () => {
      document.title = fallback;
    };
  }, [title, fallback]);
}

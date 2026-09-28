import { useEffect, useState } from 'react';
import { useT } from '../i18n';

/**
 * When the browser won't let Folio store anything, say so on every page. Without it, opening the sample or
 * saving a course simply did nothing.
 */
export function StorageBlocked() {
  const t = useT();
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let live = true;
    // Loaded on demand: the storage code stays out of the first page load.
    void import('../state/db').then((m) => m.storageWorks()).then((works) => live && setBlocked(!works));
    return () => {
      live = false;
    };
  }, []);
  if (!blocked) return null;
  return (
    <div role="alert" className="no-print flex items-start gap-3 border-b border-rule bg-attention-tint px-5 py-3 font-ui text-14 text-ink md:px-8">
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rotate-45 bg-attention" />
      <p className="max-w-3xl">{t.errors.storageBlocked}</p>
    </div>
  );
}

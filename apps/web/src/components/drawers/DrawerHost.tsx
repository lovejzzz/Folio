import { Drawer } from '@folio/ui';
import { useEffect } from 'react';
import { useT } from '../../i18n';
import { useUi } from '../../state/ui';
import { ChangesDrawer } from './ChangesDrawer';
import { ExportDrawer } from './ExportDrawer';
import { SourcesDrawer } from './SourcesDrawer';
import { exportText } from '../../i18n/exportText';

/** One drawer at a time: Changes, Sources or Export. */
export function DrawerHost() {
  const t = useT();
  const { drawer, openDrawer } = useUi();
  const titles = { changes: t.changes.title, sources: t.sources.title, export: exportText.title };
  useEffect(() => {
    if (!drawer) return;
    // Esc closes the drawer from anywhere, unless a dialog above it is handling Esc.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[data-rac][role="dialog"], [role="alertdialog"]')) return;
      openDrawer(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, openDrawer]);
  return (
    <Drawer isOpen={drawer !== null} onClose={() => openDrawer(null)} title={drawer ? titles[drawer] : ''} closeLabel={t.common.close}>
      {drawer === 'changes' && <ChangesDrawer />}
      {drawer === 'sources' && <SourcesDrawer />}
      {drawer === 'export' && <ExportDrawer />}
    </Drawer>
  );
}

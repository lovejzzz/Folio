import { Drawer } from '@folio/ui';
import { useT } from '../../i18n';
import { useUi } from '../../state/ui';
import { ChangesDrawer } from './ChangesDrawer';
import { ExportDrawer } from './ExportDrawer';
import { SourcesDrawer } from './SourcesDrawer';

/** One drawer at a time: Changes, Sources or Export. */
export function DrawerHost() {
  const t = useT();
  const { drawer, openDrawer } = useUi();
  const titles = { changes: t.changes.title, sources: t.sources.title, export: t.export.title };
  return (
    <Drawer isOpen={drawer !== null} onClose={() => openDrawer(null)} title={drawer ? titles[drawer] : ''} closeLabel={t.common.close}>
      {drawer === 'changes' && <ChangesDrawer />}
      {drawer === 'sources' && <SourcesDrawer />}
      {drawer === 'export' && <ExportDrawer />}
    </Drawer>
  );
}

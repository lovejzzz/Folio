import { Button } from '@folio/ui';
import { useNavigate } from '@tanstack/react-router';
import { useT } from '../../i18n';
import { dropSession, keepThisVersion, reloadFromDisk, useStore } from '../../state/session';
import { useUi } from '../../state/ui';

/** Another tab changed or deleted this course. Saving waits until the teacher picks a copy. */
export function ConflictBanner() {
  const t = useT();
  const conflict = useUi((s) => s.conflict);
  const store = useStore();
  const navigate = useNavigate();
  if (!conflict) return null;
  const leave = () => {
    useUi.getState().setConflict(null);
    dropSession(store.getState().id);
    void navigate({ to: '/library' });
  };
  return (
    <div role="alert" className="no-print sticky top-14 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-attention-tint px-4 py-2.5 font-ui text-14 text-ink md:px-5">
      <span aria-hidden className="size-2 shrink-0 rotate-45 bg-attention" />
      <p className="min-w-0 flex-1">{conflict === 'deleted' ? t.conflict.deleted : t.conflict.changed}</p>
      <div className="flex gap-2">
        {conflict === 'deleted' ? (
          <Button size="sm" variant="quiet" onPress={leave}>
            {t.conflict.leave}
          </Button>
        ) : (
          <Button size="sm" variant="quiet" onPress={() => void keepThisVersion()}>
            {t.conflict.keepMine}
          </Button>
        )}
        <Button size="sm" variant="secondary" onPress={() => void (conflict === 'deleted' ? keepThisVersion() : reloadFromDisk())}>
          {conflict === 'deleted' ? t.conflict.restore : t.conflict.loadLatest}
        </Button>
      </div>
    </div>
  );
}

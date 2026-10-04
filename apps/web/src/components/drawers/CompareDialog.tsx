import { CourseStore, lessonNumber, project, type GeneratedKind } from '@folio/core';
import { Button, Dialog, SegmentedControl } from '@folio/ui';
import { useState } from 'react';
import { useT } from '../../i18n';
import { acceptProposal, keepMine, useProposals } from '../../state/proposals';
import { useCourse } from '../../state/session';
import { DocView } from '../DocView';

/** Yours beside the proposed update. Nothing changes until the teacher chooses. */
export function CompareDialog({ lessonId, kind, onClose }: { lessonId: string; kind: GeneratedKind; onClose: () => void }) {
  const t = useT();
  const course = useCourse();
  const pending = useProposals((s) => s.pending[`${lessonId}:${kind}`]);
  const [side, setSide] = useState<'yours' | 'proposed'>('proposed');
  if (!pending || pending.status !== 'ready') return null;
  const preview = new CourseStore(course);
  preview.apply(pending.commands, { label: { key: 'preview' }, source: 'ai' });
  const source = side === 'yours' ? course : preview.getState();
  const doc = project(source, kind, { audience: 'teacher', lessonIds: [lessonId] });
  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} title={`${t.changes.proposal} · ${t.materialOne[kind]} · ${t.common.lesson(lessonNumber(course, lessonId))}`} size="lg">
      <div className="px-6 pb-6">
        <SegmentedControl
          label={t.changes.compare}
          value={side}
          onChange={setSide}
          className="mt-4"
          options={[
            { id: 'yours', label: t.changes.yours },
            { id: 'proposed', label: t.changes.proposed },
          ]}
        />
        <div className={side === 'proposed' ? 'folio-proposed mt-4 max-h-96 overflow-y-auto rounded-control border border-rule p-5' : 'mt-4 max-h-96 overflow-y-auto rounded-control border border-rule p-5'}>
          <DocView doc={doc} showTitle={false} courseId={course.id} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="quiet" onPress={() => { keepMine(lessonId, kind); onClose(); }}>
            {t.changes.keepMine}
          </Button>
          <Button variant="primary" onPress={() => { acceptProposal(lessonId, kind); onClose(); }}>
            {t.changes.replaceMine}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

import { accountText } from '../state/accountText';
import { Button, Checkbox, Dialog } from '@folio/ui';
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { useAccount } from '../state/account';
import { listCourses, type CourseSummary } from '../state/db';

/**
 * Just signed in, with courses already in this browser: the teacher picks which go into the account. All are
 * ticked, as most will want them all; the rest stay here, as they were.
 */
export function OfferDialog() {
  const t = useT();
  const offer = useAccount((s) => s.offer);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(offer));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void listCourses().then((all) => live && setCourses(all.filter((c) => offer.includes(c.id))));
    return () => {
      live = false;
    };
  }, [offer]);
  const answer = async (add: string[]) => {
    setBusy(true);
    await (await import('../state/sync')).answerOffer(add);
  };
  if (!offer.length) return null;
  return (
    <Dialog isOpen onOpenChange={(open) => !open && void answer([])} title={accountText.offerTitle} size="md">
      <p className="px-6 pt-2 font-ui text-14 leading-relaxed text-ink-2">{accountText.offerLede}</p>
      <ul className="mx-6 mt-5 max-h-72 divide-y divide-rule overflow-y-auto rounded-control border border-rule">
        {courses.map((c) => (
          <li key={c.id} className="px-4 py-3">
            <Checkbox
              isSelected={picked.has(c.id)}
              onChange={(on) => setPicked((p) => (on ? new Set([...p, c.id]) : new Set([...p].filter((id) => id !== c.id))))}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-reading text-15 text-ink">{c.title || t.common.untitled}</span>
                <span className="block font-ui text-12 text-ink-2">{accountText.lessons(c.lessonCount)}</span>
              </span>
            </Checkbox>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-end gap-2 px-6 pb-5 pt-6">
        <Button variant="quiet" isDisabled={busy} onPress={() => void answer([])}>
          {accountText.offerKeep}
        </Button>
        <Button variant="primary" isDisabled={busy || picked.size === 0} onPress={() => void answer([...picked])}>
          {accountText.offerAdd(picked.size)}
        </Button>
      </div>
    </Dialog>
  );
}

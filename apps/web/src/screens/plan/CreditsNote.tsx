import { useEffect } from 'react';
import { creditsText, estimateCredits, estimateDollars, refreshCredits, useCredits } from '../../state/credits';
import { usePrefs } from '../../state/prefs';

/** What writing the course will take: in credits beside what the teacher has, or in dollars with a key of their own. */
export function CreditsNote({ lessons, kinds }: { lessons: number; kinds: readonly string[] }) {
  const provider = usePrefs((s) => s.provider);
  const balance = useCredits((s) => s.balance);
  useEffect(() => {
    if (provider === 'folio') void refreshCredits();
  }, [provider]);
  if (lessons === 0) return null;
  // With a key of their own a teacher pays the provider: said in dollars, before anything is written.
  if (provider !== 'folio') return <p className="mt-1 font-ui text-13 leading-5 text-ink-2">{creditsText.ownKey(estimateDollars(lessons, kinds))}</p>;
  const need = estimateCredits(lessons, kinds);
  const short = balance !== null && balance < need;
  return <p className={short ? 'mt-1 font-ui text-13 leading-5 text-critical' : 'mt-1 font-ui text-13 leading-5 text-ink-2'}>{creditsText.estimate(need, balance)}</p>;
}

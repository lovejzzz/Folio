import { useEffect } from 'react';
import { creditsText, estimateCredits, refreshCredits, useCredits } from '../../state/credits';
import { usePrefs } from '../../state/prefs';

/** With Folio credits, what writing the course will take, beside what the teacher has. */
export function CreditsNote({ lessons, kinds }: { lessons: number; kinds: readonly string[] }) {
  const provider = usePrefs((s) => s.provider);
  const balance = useCredits((s) => s.balance);
  useEffect(() => {
    if (provider === 'folio') void refreshCredits();
  }, [provider]);
  if (provider !== 'folio' || lessons === 0) return null;
  const need = estimateCredits(lessons, kinds);
  const short = balance !== null && balance < need;
  return <p className={short ? 'mt-1 font-ui text-13 leading-5 text-critical' : 'mt-1 font-ui text-13 leading-5 text-ink-2'}>{creditsText.estimate(need, balance)}</p>;
}

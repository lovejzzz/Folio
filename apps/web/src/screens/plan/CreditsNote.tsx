import { executionPlan, planOf, type BuildTarget } from '@folio/ai';
import type { Course } from '@folio/core';
import { useEffect } from 'react';
import { creditsText, planEstimate, refreshCredits, useCredits } from '../../state/credits';
import { usePrefs } from '../../state/prefs';

/**
 * What writing will take: in credits beside what the teacher has, or in dollars with a key of their own. Read from
 * the build's own plan: of the whole course as it stands (what is still to be written and no more), or, given
 * `targets`, of those parts alone, as when one part is written again or the failed ones are tried again.
 */
export function CreditsNote({ course, targets }: { course: Course; targets?: readonly BuildTarget[] }) {
  const provider = usePrefs((s) => s.provider);
  const balance = useCredits((s) => s.balance);
  useEffect(() => {
    if (provider === 'folio') void refreshCredits();
  }, [provider]);
  if (course.lessonOrder.length === 0) return null;
  const need = planEstimate(targets ? planOf(course, targets) : executionPlan(course));
  const quiet = 'mt-1 font-ui text-13 leading-5 text-ink-2';
  const lacking = need.noRubric ? <span className="block text-attention">{creditsText.noRubric(need.noRubric)}</span> : null;
  if (need.parts === 0) return <p className={quiet}>{creditsText.nothingLeft}{lacking}</p>;
  const also = need.needed ? ` ${creditsText.alsoWritten}` : '';
  // With a key of their own a teacher pays the provider: said in dollars, before anything is written.
  if (provider !== 'folio') return <p className={quiet}>{creditsText.ownKey(need.dollars)}{also}{lacking}</p>;
  const short = balance !== null && balance < need.credits;
  return (
    <p className={short ? 'mt-1 font-ui text-13 leading-5 text-critical' : quiet}>
      {creditsText.estimate(need.credits, balance)}
      {also}
      {lacking}
    </p>
  );
}

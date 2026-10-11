import { executionPlan } from '@folio/ai';
import type { Course } from '@folio/core';
import { useEffect } from 'react';
import { creditsText, planEstimate, refreshCredits, useCredits } from '../../state/credits';
import { usePrefs } from '../../state/prefs';

/**
 * What writing the course will take: in credits beside what the teacher has, or in dollars with a key of their own.
 * Read from the build's own plan of the course as it stands, so it is of what is still to be written and no more.
 */
export function CreditsNote({ course }: { course: Course }) {
  const provider = usePrefs((s) => s.provider);
  const balance = useCredits((s) => s.balance);
  useEffect(() => {
    if (provider === 'folio') void refreshCredits();
  }, [provider]);
  if (course.lessonOrder.length === 0) return null;
  const need = planEstimate(executionPlan(course));
  const quiet = 'mt-1 font-ui text-13 leading-5 text-ink-2';
  if (need.parts === 0) return <p className={quiet}>{creditsText.nothingLeft}</p>;
  const also = need.needed ? ` ${creditsText.alsoWritten}` : '';
  // With a key of their own a teacher pays the provider: said in dollars, before anything is written.
  if (provider !== 'folio') return <p className={quiet}>{creditsText.ownKey(need.dollars)}{also}</p>;
  const short = balance !== null && balance < need.credits;
  return (
    <p className={short ? 'mt-1 font-ui text-13 leading-5 text-critical' : quiet}>
      {creditsText.estimate(need.credits, balance)}
      {also}
    </p>
  );
}

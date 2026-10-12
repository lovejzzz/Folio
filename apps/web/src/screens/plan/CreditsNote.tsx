import { buildPlan, DEFAULT_MODELS, livePrices, ownToWrite, priceFor, type BuildTarget, type Price } from '@folio/ai';
import type { Course } from '@folio/core';
import { useEffect, useState } from 'react';
import { creditsText, refreshCredits, useCredits } from '../../state/credits';
import { estimateLines, planEstimate, type Paying } from '../../state/estimate';
import { usePrefs } from '../../state/prefs';

/** Today's price list, asked for once a note for a teacher's own key is shown; null until it is in, or when it cannot be had. */
function useLivePrices(wanted: boolean): Map<string, Price> | null {
  const [live, setLive] = useState<Map<string, Price> | null>(null);
  useEffect(() => {
    let on = wanted;
    if (wanted) void livePrices().then((p) => on && setLive(p));
    return () => void (on = false);
  }, [wanted]);
  return live;
}

/**
 * Who is paid for a build started now, and at what price: Folio credits against a balance, or a provider at a model's
 * price. `ask` false reads what is known and asks no server: for a line shown on every screen of a course, signed in or not.
 */
export function usePaying(ask = true): Paying {
  const provider = usePrefs((s) => s.provider);
  const model = usePrefs((s) => (s.provider ? s.models[s.provider] || DEFAULT_MODELS[s.provider] : ''));
  const balance = useCredits((s) => s.balance);
  const packs = useCredits((s) => s.packs);
  const own = provider !== null && provider !== 'folio' && provider !== 'local';
  const live = useLivePrices(ask && own);
  useEffect(() => {
    if (ask && provider === 'folio') void refreshCredits();
  }, [ask, provider]);
  return { provider, model, price: own ? priceFor(provider, model, live) : null, balance, packs };
}

/**
 * What a build will take, beside every button that starts one: the first build and Resume (the whole course as it
 * stands), or, given `targets`, those parts and what they cannot be written without (one part written again, the
 * failed ones tried again). Read from the plan the build itself runs, at the model and the materials chosen now.
 */
export function CreditsNote({ course, targets }: { course: Course; targets?: readonly BuildTarget[] }) {
  const pay = usePaying();
  if (course.lessonOrder.length === 0) return null;
  const need = planEstimate(buildPlan(course, targets));
  const lines = estimateLines(need, pay);
  const lacking = ownToWrite(course, targets?.map((x) => x.lessonId));
  if (lacking.length) lines.push(creditsText.ownToWrite([...new Set(lacking.flatMap((x) => x.pieces))], lacking.length));
  const short = pay.provider === 'folio' && pay.balance !== null && need.parts > 0 && pay.balance < need.credits[1];
  return (
    <p role="note" aria-label={creditsText.noteLabel} className={`mt-1 font-ui text-13 leading-5 ${short ? 'text-critical' : 'text-ink-2'}`}>
      {lines.map((line, i) => (
        <span key={line} className={i === 0 ? 'block' : 'block text-ink-2'}>
          {line}
        </span>
      ))}
    </p>
  );
}

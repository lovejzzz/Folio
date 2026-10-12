import { buildPlan, DEFAULT_MODELS, livePrices, ownToWrite, priceFor, REVIEW_MODELS, sectionPrompt, type BuildTarget, type PlannedTask, type Price } from '@folio/ai';
import { GENERATED_KINDS, type Course } from '@folio/core';
import { useEffect, useMemo, useState } from 'react';
import { creditsText, refreshCredits, useCredits } from '../../state/credits';
import { estimateLines, planEstimate, type Estimate, type Paying, type RoutePrice } from '../../state/estimate';
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

const perThousand = (p: Price | null): RoutePrice | null => (p ? { sent: p.input * 1000, written: p.output * 1000 } : null);

/**
 * Who is paid for a build started now, and at what price: Folio credits against a balance, or a provider at a model's
 * prices for what is sent and what is written, with the prices of the model that reads each plan where the provider has
 * one. `ask` false reads what is known and asks no server: for a line shown on every screen of a course, signed in or not.
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
  const reader = own ? REVIEW_MODELS[provider] : undefined;
  return { provider, model, balance, packs, reader, prices: { write: own && provider ? perThousand(priceFor(provider, model, live)) : null, ...(reader && provider ? { check: perThousand(priceFor(provider, reader, live)) } : {}) } };
}

/** How large, in thousands of tokens, a part's own request is now, for each kind of part a plan runs: read from the request itself (lesson, course, sources), over up to three of the lessons it is run for. */
function sentNow(course: Course, plan: readonly PlannedTask[]): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  for (const kind of GENERATED_KINDS) {
    const lessons = plan.filter((t) => t.state === 'run' && t.kind === kind).map((t) => course.lessons[t.lessonId]).filter((l) => l !== undefined);
    const some = [lessons[0], lessons[Math.floor(lessons.length / 2)], lessons.at(-1)].filter((l, i, all) => l !== undefined && all.indexOf(l) === i);
    if (some.length) out[kind] = some.reduce((n, l) => n + sectionPrompt(course, l!, kind).length, 0) / some.length / 4000;
  }
  return out;
}

/** What a plan already made is expected to take, at the size of its parts' requests now. */
export const estimateOf = (course: Course, plan: readonly PlannedTask[]): Estimate => planEstimate(plan, sentNow(course, plan));

/** The plan of a build as it stands now, and what it is expected to take: the one reading every note and line shows. */
export function usePlanEstimate(course: Course, targets?: readonly BuildTarget[]): Estimate {
  const key = targets?.map((t) => `${t.lessonId}:${t.kind}`).join('|');
  // (Targets are compared by what they name: a list made again on every render is the same list.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ((plan) => planEstimate(plan, sentNow(course, plan)))(buildPlan(course, targets)), [course, key]);
}

/**
 * What a build will take, beside every button that starts one: the first build and Resume (the whole course as it
 * stands), or, given `targets`, those parts and what they cannot be written without (one part written again, the
 * failed ones tried again). Read from the plan the build itself runs, at the model and the materials chosen now.
 */
export function CreditsNote({ course, targets }: { course: Course; targets?: readonly BuildTarget[] }) {
  const pay = usePaying();
  const need = usePlanEstimate(course, targets);
  if (course.lessonOrder.length === 0) return null;
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

import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useAccount } from '../../state/account';
import { creditsText, estimateCredits, refreshCredits, useCredits } from '../../state/credits';
import { useDraft } from '../../state/draft';
import { usePrefs } from '../../state/prefs';

/**
 * Writing with Folio credits: what's left, beside Continue. When the course as set looks like more than that,
 * it says so and leads to the packs instead.
 */
export function CreditsLeft() {
  const provider = usePrefs((s) => s.provider);
  const user = useAccount((s) => s.user);
  const { balance, available } = useCredits();
  const { lessons, lessonsFromFiles, materials } = useDraft();
  useEffect(() => {
    if (provider === 'folio' && user) void refreshCredits();
  }, [provider, user]);
  if (provider !== 'folio' || !user || !available || balance === null) return null;
  // Lessons still to be read from a syllabus: no estimate yet, only the balance.
  const need = lessonsFromFiles ? 0 : estimateCredits(lessons, materials);
  if (need > balance) {
    return (
      <span className="flex items-center gap-2 font-ui text-13" title={creditsText.estimate(need, balance)}>
        <span className="text-critical">{creditsText.notEnough}</span>
        <Link to="/settings" hash="credits" className="rounded-control font-medium text-accent underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">
          {creditsText.addCredits}
        </Link>
      </span>
    );
  }
  return <span className="font-ui text-13 text-ink-2">{creditsText.left(balance)}</span>;
}

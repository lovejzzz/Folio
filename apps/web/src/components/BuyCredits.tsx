import { cx } from '@folio/ui';
import { useEffect, useRef } from 'react';
import { bonusOf, buy, creditsText, useCredits, type Pack } from '../state/credits';
import { toast } from '../state/toasts';

function PackButton({ pack }: { pack: Pack }) {
  const bonus = bonusOf(pack) > 0;
  return (
    <button
      type="button"
      aria-label={creditsText.pack(pack)}
      onClick={() => void buy(pack.id).then((ok) => ok || toast({ message: creditsText.buyFailed, tone: 'critical' }))}
      className="flex flex-col items-start gap-0.5 rounded-control border border-rule bg-paper px-4 py-3 text-left outline-none transition-colors duration-120 hover:border-field focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="font-ui text-18 font-semibold text-ink">${pack.usd}</span>
        {bonus && <span className="whitespace-nowrap rounded-full bg-accent-tint px-2 py-0.5 font-ui text-12 font-medium text-accent">{creditsText.packMore(pack)}</span>}
      </span>
      <span className="font-ui text-14 text-ink">{creditsText.packCredits(pack)}</span>
      <span className={cx('font-ui text-12', bonus ? 'font-medium text-good' : 'text-ink-3')}>{creditsText.packBonus(pack)}</span>
    </button>
  );
}

/** The packs, each a button to Stripe's payment page; the larger ones come with bonus credits. */
export function BuyCredits() {
  const packs = useCredits((s) => s.packs);
  const ref = useRef<HTMLDivElement>(null);
  // Sent here from "Add credits" on the home page: the packs come into view once they have loaded.
  useEffect(() => {
    if (packs.length && location.hash === '#credits') ref.current?.scrollIntoView({ block: 'center' });
  }, [packs.length]);
  if (!packs.length) return <p className="font-ui text-13 text-ink-2">{creditsText.buySoon}</p>;
  return (
    <div id="credits" ref={ref} className="scroll-mt-24 pt-1">
      <p className="mb-2 font-ui text-13 font-medium text-ink">{creditsText.buy}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {packs.map((p) => (
          <PackButton key={p.id} pack={p} />
        ))}
      </div>
      <p className="mt-2 font-ui text-12 text-ink-2">
        {creditsText.packHint}{' '}
        <a href="/terms" target="_blank" rel="noreferrer" className="text-accent underline-offset-4 hover:underline">
          {creditsText.terms}
        </a>
      </p>
    </div>
  );
}

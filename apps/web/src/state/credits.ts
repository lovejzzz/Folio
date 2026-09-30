import { create } from 'zustand';

/**
 * The signed-in teacher's Folio credits, as the server reports them. Loaded with the screens that show them,
 * never on the first page. A credit is a cent; a call costs three times its model price, as the server charges.
 */

export const MARKUP = 3;
export const creditsFor = (usd: number): number => Math.max(0, Math.round(usd * MARKUP * 100));

export interface Pack {
  id: string;
  usd: number;
  credits: number;
}

interface Credits {
  /** Null until asked; the server's answer after that. */
  balance: number | null;
  /** What can be bought; empty until Folio takes payments. */
  packs: Pack[];
  /** False where the server has no key of Folio's own yet: credits can't be used there. */
  available: boolean;
  /** Whether the account's address is a school one (.edu), which the free credits come with. */
  school: boolean;
}

export const useCredits = create<Credits>(() => ({ balance: null, packs: [], available: true, school: true }));

/** Ask the server for the balance. Quietly keeps the last answer when it can't be reached. */
export async function refreshCredits(): Promise<void> {
  try {
    const response = await fetch('/api/credits', { credentials: 'same-origin' });
    if (!response.ok) return;
    const body = (await response.json()) as { balance: number; available: boolean; packs?: Pack[]; school?: boolean };
    useCredits.setState({ balance: body.balance, available: body.available, packs: body.packs ?? [], school: body.school ?? true });
  } catch {
    // Offline or signed out elsewhere: the balance shown stays as it was.
  }
}

/** Go to Stripe's page to pay for a pack; the credits arrive when Stripe confirms the payment. */
export async function buy(pack: string): Promise<boolean> {
  try {
    const response = await fetch('/api/billing/checkout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-folio': '1' }, body: JSON.stringify({ pack }) });
    const body = (await response.json()) as { url?: string };
    if (!response.ok || !body.url) return false;
    window.location.assign(body.url);
    return true;
  } catch {
    return false;
  }
}

/** Back from paying: Stripe's confirmation can take a moment, so the balance is asked for a few times. */
export async function afterPurchase(): Promise<void> {
  const before = useCredits.getState().balance;
  for (const wait of [0, 1500, 3000, 6000]) {
    await new Promise((r) => setTimeout(r, wait));
    await refreshCredits();
    const now = useCredits.getState().balance;
    if (before !== null && now !== null && now > before) return;
  }
}

/** Credits a dollar buys in the smallest pack; the larger packs add bonus credits on top. */
const BASE_RATE = 100;
export const bonusOf = (p: Pack) => Math.max(0, p.credits - p.usd * BASE_RATE);

export const creditsText = {
  used: (n: number) => (n <= 1 ? 'That used about 1 credit.' : `That used about ${n.toLocaleString('en-US')} credits.`),
  balance: (n: number) => `${n.toLocaleString('en-US')} credits`,
  left: (n: number) => `${n.toLocaleString('en-US')} credits left`,
  notEnough: 'Not enough credits',
  addCredits: 'Add credits',
  youHave: (n: number) => `You have ${n.toLocaleString('en-US')} credits.`,
  signInToStart: 'Sign in with Google to start. Sign in with a school email (ending in .edu) and you get 750 free credits, about a 15-lesson course with every material.',
  notSchool: 'Free credits come with school email addresses, ending in .edu. Buy credits below, or use your own AI key.',
  signIn: 'Sign in with Google',
  how: 'Claude Sonnet 5.5 writes, and Claude Opus 5.5 checks each lesson plan. A lesson with every material uses about 45 credits.',
  buy: 'Buy credits',
  buySoon: 'Buying more credits opens soon.',
  pack: (p: Pack) => `$${p.usd} for ${p.credits.toLocaleString('en-US')} credits${bonusOf(p) ? `, including ${bonusOf(p).toLocaleString('en-US')} bonus` : ''}`,
  packCredits: (p: Pack) => `${p.credits.toLocaleString('en-US')} credits`,
  packBonus: (p: Pack) => (bonusOf(p) ? `Includes ${bonusOf(p).toLocaleString('en-US')} bonus` : 'Standard rate'),
  packMore: (p: Pack) => `${Math.round((bonusOf(p) / (p.usd * BASE_RATE)) * 100)}% bonus`,
  packHint: 'Paid on Stripe’s page. Credits don’t expire and aren’t refundable.',
  terms: 'Terms and refunds',
  lostOnDelete: (n: number) => `This account still has ${n.toLocaleString('en-US')} Folio credits. Deleting it ends them: they can’t be restored or refunded.`,
  buyFailed: 'The payment page didn’t open. Try again in a moment.',
  thanks: 'Thank you. Your credits are added as soon as Stripe confirms the payment.',
  unavailable: 'Folio credits aren’t switched on yet. Use your own key for now.',
  signInFirst: 'Sign in with Google first.',
  estimate: (n: number, have: number | null) => (have === null ? `About ${n.toLocaleString('en-US')} credits.` : `About ${n.toLocaleString('en-US')} credits; you have ${have.toLocaleString('en-US')}.`),
};

/**
 * Credits a lesson's parts use, measured on a 28-lesson course written with Sonnet 5.5 and checked by Opus 5.5
 * (the plan includes its review and any fixes). Overview and syllabus are built from the rest and cost nothing.
 */
const PER_LESSON: Partial<Record<string, number>> = { plan: 23, slides: 6, quiz: 7, study: 5, faq: 3, discussions: 3, assignments: 3, rubrics: 2 };

/** About how many credits writing these lessons with these materials takes, rounded up to ten. */
export function estimateCredits(lessons: number, kinds: readonly string[]): number {
  const each = kinds.reduce((sum, k) => sum + (PER_LESSON[k] ?? 0), 0);
  return Math.ceil((lessons * each) / 10) * 10;
}

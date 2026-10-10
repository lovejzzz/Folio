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
  /** The last time the balance was asked for, it couldn't be had: a screen offers to ask again. */
  failed: boolean;
}

export const useCredits = create<Credits>(() => ({ balance: null, packs: [], available: true, school: true, failed: false }));

/** Ask the server for the balance. Keeps the last answer when it can't be reached, and says it couldn't. */
export async function refreshCredits(): Promise<void> {
  try {
    const response = await fetch('/api/credits', { credentials: 'same-origin' });
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as { balance: number; available: boolean; packs?: Pack[]; school?: boolean };
    useCredits.setState({ balance: body.balance, available: body.available, packs: body.packs ?? [], school: body.school ?? true, failed: false });
  } catch {
    // Offline, the server busy, or signed out elsewhere: the balance shown stays as it was.
    useCredits.setState({ failed: true });
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
  signInToStart: 'Sign in with Google to start. Sign in with a school email (ending in .edu) and you get 750 free credits, enough for about 3 lessons with every material.',
  notSchool: 'Free credits come with school email addresses, ending in .edu. Buy credits below, or use your own AI key.',
  signIn: 'Sign in with Google',
  how: 'Claude Sonnet 5.5 writes the plans, slides, study guides, discussions and FAQ; GPT-6.1 Sol writes the quizzes, the assignments and the answer keys, and checks every lesson plan. Each part uses the model that did it best for a fair price. A lesson with every material uses about 40 credits.',
  buy: 'Buy credits',
  buySoon: 'Buying more credits opens soon.',
  pack: (p: Pack) => `$${p.usd} for ${p.credits.toLocaleString('en-US')} credits${bonusOf(p) ? `, including ${bonusOf(p).toLocaleString('en-US')} bonus` : ''}`,
  packCredits: (p: Pack) => `${p.credits.toLocaleString('en-US')} credits`,
  packBonus: (p: Pack) => (bonusOf(p) ? `Includes ${bonusOf(p).toLocaleString('en-US')} bonus` : 'Standard rate'),
  packMore: (p: Pack) => `${Math.round((bonusOf(p) / (p.usd * BASE_RATE)) * 100)}% bonus`,
  packHint: 'Paid on Stripe’s page. Credits don’t expire and aren’t refundable.',
  terms: 'Terms and refunds',
  balanceFailed: 'Your balance couldn’t be loaded.',
  tryAgain: 'Try again',
  mayBeLost: 'Any Folio credits left in this account end with it: they can’t be restored or refunded.',
  lostOnDelete: (n: number) => `This account still has ${n.toLocaleString('en-US')} Folio credits. Deleting it ends them: they can’t be restored or refunded.`,
  buyFailed: 'The payment page didn’t open. Try again in a moment.',
  thanks: 'Thank you. Your credits are added as soon as Stripe confirms the payment.',
  unavailable: 'Folio credits aren’t switched on yet. Use your own key for now.',
  signInFirst: 'Sign in with Google first.',
  ownKey: (usd: number) => `About $${usd < 10 ? usd.toFixed(1) : Math.round(usd)} at your provider’s prices, as measured on courses like this one.`,
  estimate: (n: number, have: number | null) => (have === null ? `About ${n.toLocaleString('en-US')} credits.` : `About ${n.toLocaleString('en-US')} credits; you have ${have.toLocaleString('en-US')}.`),
};

/**
 * Credits a lesson's parts use with Folio's mix (packages/ai/src/adapters/mix.ts): what each part's calls cost at the
 * providers' prices, times the markup (server/src/credits.ts), a credit being a cent. Measured on 9 October 2026 on a
 * paid run of one course of a lecture and a lab, two lessons, 66 cents of calls a lesson:
 * - the plan with its reading, its mend, its sheets, their keys and the check of the keys: 28 cents;
 * - slides 8, study guide 5, FAQ 3, discussion prompts 2 (written with more thought since 0.0.33);
 * - the quiz with the check of its answers 5, the graded work with its check 11.
 * The numbers here before were a third of these: they came from a count of characters that left out the models' thinking,
 * and from before the checks and mends that have been added since. Rubrics come with the assignments. Overview and
 * syllabus are built from the rest and cost nothing.
 */
const PER_LESSON: Partial<Record<string, number>> = { plan: 85, slides: 25, quiz: 16, study: 14, faq: 10, discussions: 7, assignments: 32, rubrics: 0 };

/** About what the same lessons cost a teacher who writes with their own key, in dollars at the providers' prices. */
export function estimateDollars(lessons: number, kinds: readonly string[]): number {
  const each = kinds.reduce((sum, k) => sum + (PER_LESSON[k] ?? 0), 0);
  return (lessons * each) / MARKUP / 100;
}

/** About how many credits writing these lessons with these materials takes, rounded up to ten. */
export function estimateCredits(lessons: number, kinds: readonly string[]): number {
  const each = kinds.reduce((sum, k) => sum + (PER_LESSON[k] ?? 0), 0);
  return Math.ceil((lessons * each) / 10) * 10;
}

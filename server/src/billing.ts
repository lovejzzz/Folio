import { addEntry, addPurchase, MILLI, purchaseOf, totalOf } from './credits';
import type { Env, User } from './types';

/**
 * Buying credits with Stripe Checkout. The page asks for a pack; this makes a Checkout page for it and sends
 * the teacher there. Stripe tells Folio when the payment went through (a signed webhook), and only then are the
 * credits added, once per payment however often Stripe tells.
 */

export interface Pack {
  id: string;
  usd: number;
  credits: number;
}

/** $10 for 1,000 credits; the larger packs include bonus credits (10%, 20%, 30%). A credit is a cent. */
export const PACKS: readonly Pack[] = [
  { id: 'p10', usd: 10, credits: 1000 },
  { id: 'p25', usd: 25, credits: 2750 },
  { id: 'p50', usd: 50, credits: 6000 },
  { id: 'p100', usd: 100, credits: 13000 },
];

const STRIPE = 'https://api.stripe.com/v1';
const SITE = 'https://folio.university';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** Make a Checkout page for a pack; the answer is where to send the teacher. */
export async function checkout(request: Request, env: Env, user: User, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'unavailable' }, 503);
  const { pack: id } = ((await request.json().catch(() => ({}))) ?? {}) as { pack?: string };
  const pack = PACKS.find((p) => p.id === id);
  if (!pack) return json({ error: 'bad-pack' }, 400);
  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(pack.usd * 100),
    'line_items[0][price_data][product_data][name]': `Folio credits: ${pack.credits.toLocaleString('en-US')}`,
    'line_items[0][price_data][product_data][description]': 'Prepaid credits for writing courses on folio.university. They don’t expire.',
    client_reference_id: user.id,
    customer_email: user.email,
    'metadata[user_id]': user.id,
    'metadata[credits]': String(pack.credits),
    'metadata[pack]': pack.id,
    'payment_intent_data[description]': `Folio credits (${pack.credits})`,
    success_url: `${SITE}/settings?purchase=done`,
    cancel_url: `${SITE}/settings?purchase=cancelled`,
  });
  // Sales tax, where the account has Stripe Tax switched on.
  if (env.STRIPE_TAX === 'on') form.set('automatic_tax[enabled]', 'true');
  const response = await fetchImpl(`${STRIPE}/checkout/sessions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!response.ok) return json({ error: 'stripe' }, 502);
  const session = (await response.json()) as { url?: string };
  return session.url ? json({ url: session.url }) : json({ error: 'stripe' }, 502);
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Stripe signs each webhook: "t=<time>,v1=<HMAC-SHA256 of 't.body'>". Older than five minutes is refused. */
export async function verifySignature(body: string, header: string, secret: string, now = Date.now()): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  const signatures = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  if (!t || !signatures.length || Math.abs(now / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)));
  // Compared in full whatever the first difference, so the time taken says nothing.
  return signatures.some((s) => s.length === expected.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0);
}

interface CheckoutSession {
  id: string;
  payment_status?: string;
  payment_intent?: string | null;
  metadata?: Record<string, string>;
  amount_total?: number;
}

interface Charge {
  id: string;
  payment_intent?: string | null;
  amount: number;
  amount_refunded: number;
}

interface Dispute {
  id: string;
  payment_intent?: string | null;
  status?: string;
}

type Event = { type: string; data: { object: unknown } };

/** A purchase is known by its payment, which refunds and disputes name too. */
const paymentRef = (paymentIntent: string | null | undefined, fallback: string) => `stripe:${paymentIntent ?? fallback}`;

/** The pack's credits, added once, when Stripe says the payment went through. */
async function purchased(env: Env, session: CheckoutSession): Promise<Response> {
  if (session.payment_status !== 'paid') return json({ received: true });
  const userId = session.metadata?.user_id;
  const credits = Number(session.metadata?.credits);
  if (!userId || !Number.isInteger(credits) || credits <= 0) return json({ error: 'metadata' }, 400);
  const detail = `${credits.toLocaleString('en-US')} credits ($${((session.amount_total ?? 0) / 100).toFixed(2)})`;
  await addPurchase(env.DB, userId, credits * MILLI, paymentRef(session.payment_intent, session.id), detail);
  return json({ received: true });
}

/**
 * A refund takes back the credits in proportion to what was refunded, a dispute all of them (given back if Folio
 * wins it). Credits already spent can leave the balance below zero until more are bought.
 */
async function reversed(env: Env, event: Event): Promise<void> {
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Charge;
    const bought = await purchaseOf(env.DB, paymentRef(charge.payment_intent, charge.id));
    if (!bought || !charge.amount) return;
    // Each refund reports the total refunded so far: take back what that total calls for, less what was taken.
    const due = Math.round((bought.amount * charge.amount_refunded) / charge.amount);
    const taken = -(await totalOf(env.DB, `refund:${charge.id}:`));
    if (due > taken) await addEntry(env.DB, bought.user_id, 'reversal', taken - due, `refund:${charge.id}:${charge.amount_refunded}`, 'Payment refunded');
    return;
  }
  const dispute = event.data.object as Dispute;
  const bought = await purchaseOf(env.DB, paymentRef(dispute.payment_intent, dispute.id));
  if (!bought) return;
  if (event.type === 'charge.dispute.created') await addEntry(env.DB, bought.user_id, 'reversal', -bought.amount, `dispute:${dispute.id}`, 'Payment disputed');
  if (event.type === 'charge.dispute.closed' && dispute.status === 'won') await addEntry(env.DB, bought.user_id, 'reversal', bought.amount, `dispute-won:${dispute.id}`, 'Dispute won');
}

/** What Stripe reports: a payment that went through, or one refunded or disputed later. */
export async function webhook(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'unavailable' }, 503);
  const body = await request.text();
  if (!(await verifySignature(body, request.headers.get('stripe-signature') ?? '', env.STRIPE_WEBHOOK_SECRET))) return json({ error: 'signature' }, 400);
  const event = JSON.parse(body) as Event;
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') return purchased(env, event.data.object as CheckoutSession);
  if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') await reversed(env, event);
  return json({ received: true });
}

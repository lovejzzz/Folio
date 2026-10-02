import { beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../src/api';
import { verifySignature } from '../src/billing';
import { balanceOf, FREE_CREDITS, MILLI } from '../src/credits';
import { forgetGoogleKeys } from '../src/google';
import type { Env } from '../src/types';
import { fakeD1, fakeGoogle } from './fake';

const CLIENT = 'client-1.apps.googleusercontent.com';
const SECRET = 'whsec_test';
let env: Env;
let google: Awaited<ReturnType<typeof fakeGoogle>>;
let stripe: URLSearchParams[];

const fetchImpl: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('https://api.stripe.com/')) {
    stripe.push(new URLSearchParams(String(init?.body)));
    return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { headers: { 'content-type': 'application/json' } });
  }
  return google.fetchImpl(input, init);
};

beforeEach(async () => {
  forgetGoogleKeys();
  env = { DB: fakeD1(), VITE_GOOGLE_CLIENT_ID: CLIENT, ANTHROPIC_API_KEY: 'sk-ant-folio-test', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SECRET };
  google = await fakeGoogle(CLIENT);
  stripe = [];
});

const call = (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET' && !path.includes('webhook')) headers.set('x-folio', '1');
  if (init.cookie) headers.set('cookie', init.cookie);
  return handle(new Request(`https://folio.university/api/${path}`, { ...init, headers }), env, fetchImpl);
};

async function signIn(): Promise<string> {
  const res = await call('session', { method: 'POST', body: JSON.stringify({ idToken: await google.token(), nonce: 'n-1' }) });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

async function signed(body: string, t = Math.floor(Date.now() / 1000), secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${mac}`;
}

const paid = (id = 'cs_test_1', status = 'paid') =>
  JSON.stringify({ type: 'checkout.session.completed', data: { object: { id, payment_intent: `pi_${id}`, payment_status: status, amount_total: 1000, metadata: { user_id: 'g-123', credits: '1000', pack: 'p10' } } } });

describe('buying credits', () => {
  it('makes a Checkout page for a pack, for this teacher', async () => {
    const cookie = await signIn();
    const res = await call('billing/checkout', { method: 'POST', cookie, body: JSON.stringify({ pack: 'p25' }) });
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    expect(stripe[0]!.get('line_items[0][price_data][unit_amount]')).toBe('2500');
    expect(stripe[0]!.get('metadata[user_id]')).toBe('g-123');
    expect(stripe[0]!.get('metadata[credits]')).toBe('2750');
    await call('billing/checkout', { method: 'POST', cookie, body: JSON.stringify({ pack: 'p100' }) });
    expect(stripe[1]!.get('line_items[0][price_data][unit_amount]')).toBe('10000');
    expect(stripe[1]!.get('metadata[credits]')).toBe('13000');
    expect((await call('billing/checkout', { method: 'POST', cookie, body: JSON.stringify({ pack: 'p1' }) })).status).toBe(400);
  });

  it('adds the credits when Stripe says the payment went through, once', async () => {
    await signIn();
    const body = paid();
    const hook = async () => call('billing/webhook', { method: 'POST', body, headers: { 'stripe-signature': await signed(body) } });
    expect((await hook()).status).toBe(200);
    expect((await hook()).status).toBe(200);
    expect(await balanceOf(env.DB, 'g-123')).toBe((FREE_CREDITS + 1000) * MILLI);
  });

  it('adds nothing for an unpaid session or a message Stripe didn’t sign', async () => {
    await signIn();
    const unpaid = paid('cs_2', 'unpaid');
    expect((await call('billing/webhook', { method: 'POST', body: unpaid, headers: { 'stripe-signature': await signed(unpaid) } })).status).toBe(200);
    const forged = paid('cs_3');
    expect((await call('billing/webhook', { method: 'POST', body: forged, headers: { 'stripe-signature': await signed(forged, undefined, 'whsec_other') } })).status).toBe(400);
    expect(await balanceOf(env.DB, 'g-123')).toBe(FREE_CREDITS * MILLI);
  });

  it('refuses an old signature, so a captured message can’t be replayed', async () => {
    const body = paid();
    expect(await verifySignature(body, await signed(body, Math.floor(Date.now() / 1000) - 3600), SECRET)).toBe(false);
    expect(await verifySignature(body, await signed(body), SECRET)).toBe(true);
  });
});

const tell = async (type: string, object: object) => {
  const body = JSON.stringify({ type, data: { object } });
  return call('billing/webhook', { method: 'POST', body, headers: { 'stripe-signature': await signed(body) } });
};
const refunded = (refundedCents: number) => tell('charge.refunded', { id: 'ch_1', payment_intent: 'pi_cs_test_1', amount: 1000, amount_refunded: refundedCents });

describe('refunds and disputes', () => {
  beforeEach(async () => {
    await signIn();
    const body = paid();
    await call('billing/webhook', { method: 'POST', body, headers: { 'stripe-signature': await signed(body) } });
  });

  it('take back the credits in proportion to what was refunded, once however often Stripe tells', async () => {
    expect((await refunded(400)).status).toBe(200);
    await refunded(400);
    expect(await balanceOf(env.DB, 'g-123')).toBe((FREE_CREDITS + 600) * MILLI);
    await refunded(1000);
    await refunded(1000);
    expect(await balanceOf(env.DB, 'g-123')).toBe(FREE_CREDITS * MILLI);
  });

  it('leave the balance below zero when the refunded credits were already spent', async () => {
    await env.DB.prepare('UPDATE credits SET balance = ? WHERE user_id = ?').bind(200 * MILLI, 'g-123').run();
    await refunded(1000);
    expect(await balanceOf(env.DB, 'g-123')).toBe(-800 * MILLI);
  });

  it('take back a disputed payment’s credits, and give them back if the dispute is won', async () => {
    const dispute = { id: 'dp_1', payment_intent: 'pi_cs_test_1' };
    await tell('charge.dispute.created', dispute);
    await tell('charge.dispute.created', dispute);
    expect(await balanceOf(env.DB, 'g-123')).toBe(FREE_CREDITS * MILLI);
    await tell('charge.dispute.closed', { ...dispute, status: 'won' });
    expect(await balanceOf(env.DB, 'g-123')).toBe((FREE_CREDITS + 1000) * MILLI);
  });

  it('take back no more than was bought when a part-refunded payment is then disputed', async () => {
    await refunded(400);
    const dispute = { id: 'dp_2', payment_intent: 'pi_cs_test_1', charge: 'ch_1' };
    await tell('charge.dispute.created', dispute);
    expect(await balanceOf(env.DB, 'g-123')).toBe(FREE_CREDITS * MILLI);
    // Won: what the dispute took comes back, not what was refunded.
    await tell('charge.dispute.closed', { ...dispute, status: 'won' });
    expect(await balanceOf(env.DB, 'g-123')).toBe((FREE_CREDITS + 600) * MILLI);
  });

  it('keep a balance below zero when the account is deleted, so signing in again doesn’t clear it', async () => {
    await env.DB.prepare('UPDATE credits SET balance = ? WHERE user_id = ?').bind(200 * MILLI, 'g-123').run();
    await refunded(1000);
    const cookie = await signIn();
    expect((await call('account', { method: 'DELETE', cookie })).status).toBe(200);
    await signIn();
    expect(await balanceOf(env.DB, 'g-123')).toBe(-800 * MILLI);
  });

  it('ignore payments Folio didn’t sell credits for', async () => {
    await tell('charge.refunded', { id: 'ch_9', payment_intent: 'pi_other', amount: 500, amount_refunded: 500 });
    expect(await balanceOf(env.DB, 'g-123')).toBe((FREE_CREDITS + 1000) * MILLI);
  });
});

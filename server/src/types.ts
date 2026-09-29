/**
 * The small part of Cloudflare's D1 that Folio uses, typed here so the server builds and tests without the
 * Workers type package. The real binding satisfies it; the tests use SQLite behind the same shape.
 */
export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  meta: { changes: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  /** Runs the statements in one transaction. */
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface Env {
  DB: D1Database;
  /** The OAuth client that signs teachers in; public, the same one the page uses. */
  VITE_GOOGLE_CLIENT_ID: string;
  /** Folio's own Anthropic key, a Cloudflare secret: calls paid with Folio credits use it. Unset: credits are off. */
  ANTHROPIC_API_KEY?: string;
  /** Stripe, as Cloudflare secrets: the key that makes Checkout pages, and the one that signs its webhooks. */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** "on" once Stripe Tax is set up in the Stripe account: Checkout then adds sales tax where it's due. */
  STRIPE_TAX?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

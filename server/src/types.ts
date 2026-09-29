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
}

export interface User {
  id: string;
  email: string;
  name: string;
}

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Result } from '../src/types';

type Value = string | number | bigint | null | Uint8Array;

/** D1's shape over an in-memory SQLite database with Folio's schema. */
export function fakeD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const statement = (sql: string, values: Value[] = []): D1PreparedStatement => ({
    bind: (...v: unknown[]) => statement(sql, v as Value[]),
    first: async <T>() => (sqlite.prepare(sql).get(...values) as T | undefined) ?? null,
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...values) as T[], meta: { changes: 0 } }),
    run: async () => ({ results: [], meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
  });
  return {
    prepare: (sql) => statement(sql),
    async batch(list) {
      sqlite.exec('BEGIN');
      try {
        const out: D1Result[] = [];
        for (const s of list) out.push(await s.run());
        sqlite.exec('COMMIT');
        return out;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

const b64url = (data: Uint8Array | string) =>
  Buffer.from(typeof data === 'string' ? new TextEncoder().encode(data) : data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A stand-in for Google: a key pair, its published keys, and ID tokens signed with it. */
export async function fakeGoogle(clientId: string) {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const fetchImpl = (async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } })) as typeof fetch;
  async function token(claims: Record<string, unknown> = {}, kid = 'k1'): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const body = { iss: 'https://accounts.google.com', aud: clientId, sub: 'g-123', email: 'teacher@example.edu', name: 'Ada Teacher', nonce: 'n-1', iat: now, exp: now + 600, ...claims };
    const head = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
    const payload = b64url(JSON.stringify(body));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${payload}`));
    return `${head}.${payload}.${b64url(new Uint8Array(sig))}`;
  }
  return { fetchImpl, token };
}

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { handle } from '../src/api';
import { SCHEMA_SHAPE } from '../src/schemaShape';
import { fakeD1 } from './fake';

describe('the database’s shape', () => {
  it('as the code knows it is what schema.sql makes', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
    const shape = Object.fromEntries(tables.map((t) => [t, (db.prepare('SELECT name FROM pragma_table_info(?) ORDER BY name').all(t) as { name: string }[]).map((r) => r.name)]));
    expect(shape).toEqual(SCHEMA_SHAPE);
  });

  it('is reported whole by /api/health, and what is missing is named', async () => {
    const DB = fakeD1();
    const env = { DB, VITE_GOOGLE_CLIENT_ID: 'client' };
    const health = () => handle(new Request('https://folio.university/api/health'), env);
    expect(await (await health()).json()).toEqual({ ok: true });
    await DB.prepare('DROP TABLE credit_holds').run();
    // A good answer stands for a minute, so a burst of requests asks the database once.
    expect((await health()).status).toBe(200);
    vi.useFakeTimers({ now: Date.now() + 61_000, toFake: ['Date'] });
    const res = await health();
    vi.useRealTimers();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, missing: ['credit_holds'] });
  });
});

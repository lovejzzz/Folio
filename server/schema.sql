-- Folio accounts: who signed in, their sessions, and the courses they keep in their account.
-- Apply with: wrangler d1 execute folio --remote --file server/schema.sql (or paste into the D1 console).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,            -- Google's subject id
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,       -- SHA-256 of the cookie; the cookie itself is never stored
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS courses (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  lesson_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL,       -- goes up by one with every write; a write names the version it replaces
  deleted INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

-- A course's saved copy (gzipped JSON), in pieces under D1's row size limit.
CREATE TABLE IF NOT EXISTS course_chunks (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  n INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (user_id, id, n)
);

-- Folio credits. Amounts are in millicredits (1 credit = 1000), so a call's cost never rounds to nothing.
CREATE TABLE IF NOT EXISTS credits (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL,       -- may dip below zero by at most one call's cost
  updated_at INTEGER NOT NULL
);

-- Every change to a balance: free grants, purchases, and each model call's cost.
CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,             -- 'grant' | 'purchase' | 'spend'
  amount INTEGER NOT NULL,        -- millicredits: positive adds, negative spends
  ref TEXT,                       -- unique where set: one grant per account, one credit per Stripe payment
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS credit_ledger_user ON credit_ledger (user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_ref ON credit_ledger (ref) WHERE ref IS NOT NULL;

-- Credits held for a model call while it runs. Settling deletes the row; a row older than any call runs is a
-- hold whose settling was lost, and is given back to the balance.
CREATE TABLE IF NOT EXISTS credit_holds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,        -- millicredits
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS credit_holds_user ON credit_holds (user_id, created_at);

-- How many free grants each network address had in a day, so a wave of new accounts can't farm them.
CREATE TABLE IF NOT EXISTS free_grants (
  ip_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, day)
);

-- How Folio is doing, per day across everyone (sign-ins, AI calls and how they ended, credits used): counts only,
-- never tied to an account, an address or a course.
CREATE TABLE IF NOT EXISTS daily_counts (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric)
);

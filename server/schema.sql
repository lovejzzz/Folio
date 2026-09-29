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

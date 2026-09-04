CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  time_created TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_5m_tokens INTEGER,
  cache_write_1h_tokens INTEGER,
  cost INTEGER NOT NULL DEFAULT 0,
  key_id TEXT NOT NULL DEFAULT '',
  session_id TEXT NOT NULL DEFAULT '',
  plan TEXT,
  PRIMARY KEY (account_id, id)
);

CREATE INDEX IF NOT EXISTS idx_usage_account_time
  ON usage_records(account_id, time_created);

CREATE TABLE IF NOT EXISTS usage_sync (
  account_id TEXT PRIMARY KEY,
  last_synced_at TEXT,
  last_cursor INTEGER NOT NULL DEFAULT 0
);

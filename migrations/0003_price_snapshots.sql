CREATE TABLE IF NOT EXISTS price_snapshots (
  fetched_at TEXT PRIMARY KEY,
  snapshot_date TEXT NOT NULL,
  monthly_credit REAL NOT NULL,
  monthly_cost REAL NOT NULL,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_date ON price_snapshots(snapshot_date);

CREATE TABLE IF NOT EXISTS model_usage_days (
  snapshot_date TEXT NOT NULL,
  model_suffix TEXT NOT NULL,
  usage REAL NOT NULL,
  PRIMARY KEY (snapshot_date, model_suffix)
);

CREATE INDEX IF NOT EXISTS idx_model_usage_days_model
  ON model_usage_days(model_suffix, snapshot_date);

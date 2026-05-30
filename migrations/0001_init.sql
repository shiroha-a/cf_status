-- Monitored targets. `name` is the stable key used by Configuration-as-Code sync.
CREATE TABLE monitors (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL UNIQUE,
  url              TEXT    NOT NULL,
  method           TEXT    NOT NULL DEFAULT 'GET',
  expected_status  INTEGER NOT NULL DEFAULT 200,
  body_match       TEXT,
  interval_seconds INTEGER NOT NULL DEFAULT 60,
  timeout_ms       INTEGER NOT NULL DEFAULT 10000,
  ssl_check        INTEGER NOT NULL DEFAULT 1,
  ssl_warn_days    INTEGER NOT NULL DEFAULT 14,
  enabled          INTEGER NOT NULL DEFAULT 1,
  current_status   TEXT    NOT NULL DEFAULT 'unknown',
  consecutive_fail INTEGER NOT NULL DEFAULT 0,
  consecutive_ok   INTEGER NOT NULL DEFAULT 0,
  down_since       INTEGER,
  last_checked_at  INTEGER,
  created_at       INTEGER NOT NULL
);

-- Per-check time series.
CREATE TABLE checks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id       INTEGER NOT NULL REFERENCES monitors(id),
  checked_at       INTEGER NOT NULL,
  ok               INTEGER NOT NULL,
  status_code      INTEGER,
  response_time_ms INTEGER,
  ssl_days_left    INTEGER,
  error            TEXT
);
CREATE INDEX idx_checks_monitor_time ON checks(monitor_id, checked_at);

-- Outage intervals. resolved_at IS NULL means the incident is ongoing.
CREATE TABLE incidents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id  INTEGER NOT NULL REFERENCES monitors(id),
  started_at  INTEGER NOT NULL,
  resolved_at INTEGER,
  cause       TEXT
);
CREATE INDEX idx_incidents_monitor ON incidents(monitor_id, started_at);

-- Daily rollups used to render the long-range uptime bar without scanning `checks`.
CREATE TABLE daily_stats (
  monitor_id INTEGER NOT NULL REFERENCES monitors(id),
  day        TEXT    NOT NULL,
  total      INTEGER NOT NULL DEFAULT 0,
  ok_count   INTEGER NOT NULL DEFAULT 0,
  avg_rt_ms  INTEGER,
  PRIMARY KEY (monitor_id, day)
);

-- Hourly rollups, used to draw an intra-day uptime sparkline inside the bar
-- tooltip. `hour` is 'YYYY-MM-DD HH' in the display time zone (same basis as
-- daily_stats' day). Kept for the same 90-day window as daily_stats.
CREATE TABLE hourly_stats (
  monitor_id INTEGER NOT NULL REFERENCES monitors(id),
  hour       TEXT    NOT NULL,
  total      INTEGER NOT NULL DEFAULT 0,
  ok_count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (monitor_id, hour)
);

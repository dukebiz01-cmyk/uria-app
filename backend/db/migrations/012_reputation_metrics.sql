-- 012: Reputation metrics for male users
CREATE TABLE IF NOT EXISTS reputation_metrics (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rep_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  level TEXT NOT NULL DEFAULT 'Bronze' CHECK (level IN ('Bronze','Silver','Gold','Platinum')),
  no_show_rate NUMERIC(5,2) NOT NULL DEFAULT 100,
  chat_quality_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  moment_verified_count INTEGER NOT NULL DEFAULT 0,
  valid_report_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reputation_level ON reputation_metrics(level);

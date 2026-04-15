-- 008: Passport metrics
CREATE TABLE IF NOT EXISTS passport_metrics (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  trust_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'Starter' CHECK (tier IN ('Starter','Silver','Gold','Platinum')),
  response_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  promise_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  moment_verified_count INTEGER NOT NULL DEFAULT 0,
  valid_report_count INTEGER NOT NULL DEFAULT 0,
  no_show_count INTEGER NOT NULL DEFAULT 0,
  activity_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

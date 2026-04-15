-- 007: Moments
CREATE TABLE IF NOT EXISTS moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES signals(id),
  male_id UUID NOT NULL REFERENCES users(id),
  female_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','checked_in','verified','rejected','expired')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moments_signal ON moments(signal_id);
CREATE INDEX IF NOT EXISTS idx_moments_status ON moments(status) WHERE status IN ('pending','checked_in');

CREATE TABLE IF NOT EXISTS moment_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES moments(id),
  user_id UUID NOT NULL REFERENCES users(id),
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  accuracy_m NUMERIC(8,2),
  mock_location_flag BOOLEAN NOT NULL DEFAULT FALSE,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(moment_id, user_id)
);

CREATE TABLE IF NOT EXISTS moment_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES moments(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  reviewee_id UUID NOT NULL REFERENCES users(id),
  eval_safe BOOLEAN,
  eval_profile_match BOOLEAN,
  eval_promise BOOLEAN,
  eval_again BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(moment_id, reviewer_id)
);

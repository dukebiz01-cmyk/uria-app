-- 009: Reports and moderation
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id),
  target_id UUID NOT NULL REFERENCES users(id),
  category TEXT NOT NULL CHECK (category IN ('fake_profile','no_show','harassment','fraud','other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','confirmed','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID,
  target_id UUID NOT NULL REFERENCES users(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('warn','suspend','ban','unsuspend','refund','adjust_score')),
  reason TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 011_push_tokens.sql
-- BUG2 수정: FCM raw token 저장 (hash 아님)
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android','ios','web')),
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, raw_token)
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id, updated_at DESC);

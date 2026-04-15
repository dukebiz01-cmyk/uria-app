-- 005: Signals
CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id),
  receiver_id UUID NOT NULL REFERENCES users(id),
  message VARCHAR(50),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','held','expired','cancelled')),
  escrow_coin INTEGER NOT NULL DEFAULT 3,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sender_id != receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_signals_receiver ON signals(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_signals_sender ON signals(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_signals_expires ON signals(expires_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS signal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES signals(id),
  actor_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_events_signal ON signal_events(signal_id);

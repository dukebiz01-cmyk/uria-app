-- 004: Wallets and ledger
CREATE TABLE IF NOT EXISTS wallets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  coin_balance INTEGER NOT NULL DEFAULT 0 CHECK (coin_balance >= 0),
  point_balance INTEGER NOT NULL DEFAULT 0 CHECK (point_balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  asset_type TEXT NOT NULL CHECK (asset_type IN ('coin','point')),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('purchase','escrow_hold','escrow_release','charge','refund','reward','adjustment')),
  amount INTEGER NOT NULL,
  balance_after INTEGER,
  ref_type TEXT,
  ref_id UUID,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_user ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_idempotency ON wallet_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL;

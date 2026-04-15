-- 003: Devices and locations
CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  install_id TEXT NOT NULL,
  device_hash TEXT,
  push_token_hash TEXT,
  last_ip_prefix TEXT,
  payment_fingerprint TEXT,
  risk_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(install_id)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_hash ON user_devices(device_hash);

CREATE TABLE IF NOT EXISTS user_locations (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  accuracy_m NUMERIC(8,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

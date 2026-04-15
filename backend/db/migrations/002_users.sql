-- 002: Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('M','F')),
  birth_year SMALLINT NOT NULL CHECK (birth_year BETWEEN 1950 AND EXTRACT(YEAR FROM NOW())::INT - 19),
  nickname VARCHAR(20) NOT NULL,
  bio VARCHAR(300),
  profile_photo_url TEXT,
  selfie_photo_url TEXT,
  selfie_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resting','suspended','banned')),
  tonight_on BOOLEAN NOT NULL DEFAULT FALSE,
  tonight_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_tonight ON users(tonight_on) WHERE tonight_on = TRUE;

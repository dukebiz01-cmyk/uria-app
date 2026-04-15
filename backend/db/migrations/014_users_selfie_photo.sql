-- 014: add selfie_photo_url for pending selfie verification
ALTER TABLE users
ADD COLUMN IF NOT EXISTS selfie_photo_url TEXT;

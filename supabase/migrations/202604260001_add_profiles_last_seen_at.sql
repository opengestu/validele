ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
ON profiles(last_seen_at)
WHERE last_seen_at IS NOT NULL;

COMMENT ON COLUMN profiles.last_seen_at IS 'Dernière activité visible côté backend (heartbeat app)';

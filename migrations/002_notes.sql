CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  content_json TEXT NOT NULL,
  share_token TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
);
CREATE INDEX idx_notes_user_updated ON notes(user_id, updated_at DESC);
CREATE UNIQUE INDEX idx_notes_share_token ON notes(share_token) WHERE share_token IS NOT NULL;

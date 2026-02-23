-- Google Drive OAuth tokens (encrypted)
ALTER TABLE user_settings ADD COLUMN google_access_token_encrypted TEXT;
ALTER TABLE user_settings ADD COLUMN google_refresh_token_encrypted TEXT;
ALTER TABLE user_settings ADD COLUMN google_token_expires_at TEXT;

-- File versioning
CREATE TABLE `workspace_file_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `file_id` text NOT NULL REFERENCES `workspace_files`(`id`) ON DELETE CASCADE,
  `version_number` integer NOT NULL,
  `r2_key` text NOT NULL,
  `size_bytes` integer DEFAULT 0,
  `created_at` text NOT NULL
);

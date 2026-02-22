CREATE TABLE `password_reset_tokens` (
  `id` TEXT PRIMARY KEY,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `token` TEXT NOT NULL UNIQUE,
  `expires_at` INTEGER NOT NULL,
  `created_at` TEXT NOT NULL
);

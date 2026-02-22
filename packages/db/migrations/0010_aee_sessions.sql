CREATE TABLE `aee_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `student_id` text NOT NULL REFERENCES `students`(`id`) ON DELETE CASCADE,
  `session_date` text NOT NULL,
  `start_time` text,
  `end_time` text,
  `present` integer NOT NULL DEFAULT 1,
  `session_type` text NOT NULL DEFAULT 'individual',
  `objectives` text,
  `activities_performed` text,
  `student_response` text,
  `observations` text,
  `next_steps` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

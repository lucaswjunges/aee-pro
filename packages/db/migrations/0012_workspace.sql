-- Workspace projects (virtual folders per student or free-form)
CREATE TABLE `workspace_projects` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `student_id` text REFERENCES `students`(`id`) ON DELETE SET NULL,
  `name` text NOT NULL,
  `description` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

-- Workspace files (metadata — content lives in R2)
CREATE TABLE `workspace_files` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL REFERENCES `workspace_projects`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `path` text NOT NULL,
  `mime_type` text NOT NULL,
  `size_bytes` integer DEFAULT 0,
  `r2_key` text NOT NULL,
  `is_output` integer DEFAULT 0,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  UNIQUE(`project_id`, `path`)
);

-- Workspace conversations (chat sessions within a project)
CREATE TABLE `workspace_conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL REFERENCES `workspace_projects`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `title` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

-- Workspace messages (individual chat messages)
CREATE TABLE `workspace_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL REFERENCES `workspace_conversations`(`id`) ON DELETE CASCADE,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `tool_calls` text,
  `token_count` integer,
  `created_at` text NOT NULL
);

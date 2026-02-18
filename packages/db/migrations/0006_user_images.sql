CREATE TABLE `user_images` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`filename` text NOT NULL,
	`display_name` text NOT NULL,
	`category` text NOT NULL,
	`r2_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

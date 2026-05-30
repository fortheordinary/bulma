CREATE TABLE `referral_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`code` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`shared_at` integer,
	`converted_user_id` text,
	`converted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`converted_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_codes_code_unique` ON `referral_codes` (`code`);--> statement-breakpoint
CREATE TABLE `referral_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_code_id` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`consumed_payout_id` text,
	`created_at` integer NOT NULL,
	`consumed_at` integer,
	`expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_code_id`) REFERENCES `referral_codes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user_profile` DROP COLUMN `tos_id`;--> statement-breakpoint
INSERT INTO `referral_codes` (`id`, `owner_user_id`, `code`, `status`, `created_at`)
VALUES ('rc_INITIALSEED1', NULL, 'INITIAL', 'available', unixepoch())
ON CONFLICT(`code`) DO NOTHING;
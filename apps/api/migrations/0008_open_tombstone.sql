CREATE TABLE `agent_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text,
	`from_email` text NOT NULL,
	`subject` text,
	`stage` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text,
	`spam_score` integer,
	`invite_code_id` text,
	`prompt_tokens` integer,
	`output_tokens` integer,
	`received_at` integer NOT NULL,
	`replied_at` integer,
	FOREIGN KEY (`invite_code_id`) REFERENCES `referral_codes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_emails_message_id_unique` ON `agent_emails` (`message_id`);--> statement-breakpoint
ALTER TABLE `referral_codes` ADD `issued_to_email` text;
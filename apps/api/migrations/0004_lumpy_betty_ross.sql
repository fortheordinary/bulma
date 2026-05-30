CREATE TABLE `payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`bank_account_id` text,
	`status` text NOT NULL,
	`sender_amount` integer,
	`receiver_amount` integer,
	`sender_wallet_address` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`currency_type` text NOT NULL,
	`cover_fees` integer NOT NULL,
	`network` text NOT NULL,
	`token` text NOT NULL,
	`sender_amount` integer NOT NULL,
	`receiver_amount` integer NOT NULL,
	`flat_fee` integer,
	`partner_fee_amount` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

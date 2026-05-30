CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`processed_at` integer,
	`error` text,
	`received_at` integer NOT NULL
);

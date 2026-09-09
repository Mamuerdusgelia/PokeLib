CREATE TABLE `operation_chunks` (
	`owner_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`kind` text NOT NULL,
	`request_hash` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `operation_id`, `chunk_index`)
);

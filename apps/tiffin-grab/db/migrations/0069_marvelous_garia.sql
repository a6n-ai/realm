CREATE TABLE "relay_block_queue" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"stream" text,
	"source" text,
	"campaign_ref" text,
	"campaign_name" text,
	"created_at" bigint NOT NULL
);

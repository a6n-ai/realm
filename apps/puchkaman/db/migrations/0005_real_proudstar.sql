CREATE TABLE "review_nudges" (
	"email" text PRIMARY KEY NOT NULL,
	"sent_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "review_nudges_sent_idx" ON "review_nudges" USING btree ("sent_at");
CREATE TABLE "relay_outbox" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"event" "app_event",
	"recipient_id" bigint,
	"recipient_email" text NOT NULL,
	"stream" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" bigint NOT NULL,
	"last_error" text,
	"relay_message_id" text,
	"sent_at" bigint,
	CONSTRAINT "relay_outbox_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "relay_outbox_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "relay_outbox" ADD CONSTRAINT "relay_outbox_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relay_outbox_due_idx" ON "relay_outbox" USING btree ("next_attempt_at") WHERE "relay_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "relay_outbox_key_prefix_idx" ON "relay_outbox" USING btree ("idempotency_key" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "relay_outbox_recipient_idx" ON "relay_outbox" USING btree ("recipient_id","created_at");
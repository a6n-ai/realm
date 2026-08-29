CREATE TABLE "catering_inquiries" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"event_date" text NOT NULL,
	"location" text NOT NULL,
	"guests" text NOT NULL,
	"event_type" text NOT NULL,
	"allergies" text,
	"message" text,
	CONSTRAINT "catering_inquiries_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE INDEX "catering_inquiries_created_idx" ON "catering_inquiries" USING btree ("created_at");
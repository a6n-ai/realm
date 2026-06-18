CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"default_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);

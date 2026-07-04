CREATE TYPE "public"."locale" AS ENUM('en', 'fr');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" "locale" DEFAULT 'en' NOT NULL;
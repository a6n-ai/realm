CREATE TABLE "coin_grant_group_members" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"group_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"awarded" boolean NOT NULL,
	CONSTRAINT "coin_grant_group_members_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "coin_grant_group_members_group_user_unique" UNIQUE("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "coin_grant_groups" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"coins" integer NOT NULL,
	"memo" text,
	"member_count" integer DEFAULT 0 NOT NULL,
	"awarded_count" integer DEFAULT 0 NOT NULL,
	"capped_count" integer DEFAULT 0 NOT NULL,
	"no_email_count" integer DEFAULT 0 NOT NULL,
	"contact_list_public_id" text,
	CONSTRAINT "coin_grant_groups_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "coin_grant_group_members" ADD CONSTRAINT "coin_grant_group_members_group_id_coin_grant_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."coin_grant_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_grant_group_members" ADD CONSTRAINT "coin_grant_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
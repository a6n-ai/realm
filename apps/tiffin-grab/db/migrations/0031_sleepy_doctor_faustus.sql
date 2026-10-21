CREATE TABLE "short_links" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"code" text NOT NULL,
	"target" text NOT NULL,
	CONSTRAINT "short_links_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "short_links_code_unique" UNIQUE("code")
);

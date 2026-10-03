CREATE TABLE "cron_runs" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"job" text NOT NULL,
	"trigger" text NOT NULL,
	"started_at" bigint NOT NULL,
	"finished_at" bigint,
	"ok" boolean,
	"summary" jsonb,
	"error" text,
	CONSTRAINT "cron_runs_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE INDEX "cron_runs_job_started_idx" ON "cron_runs" USING btree ("job","started_at");
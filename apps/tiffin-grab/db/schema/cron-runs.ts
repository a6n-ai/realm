import { updatableColumns } from "@foundry/database";
import { bigint, boolean, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";

// One row per run of a scheduled job (lib/cron/jobs.ts), whether the scheduler or an admin
// started it. Settings → Scheduled jobs reads the latest rows to show last result and history.
export const cronRuns = pgTable("cron_runs", {
  ...updatableColumns("crn"),
  job: text("job").notNull(),
  // "schedule" (GitHub Actions cron) or "manual" (Run now in Settings).
  trigger: text("trigger").notNull(),
  startedAt: bigint("started_at", { mode: "number" }).notNull(),
  // Null while running (or if the process died mid-run).
  finishedAt: bigint("finished_at", { mode: "number" }),
  ok: boolean("ok"),
  // Small counts only (no customer data): what the run did.
  summary: jsonb("summary").$type<Record<string, number | string | null>>(),
  error: text("error"),
}, (t) => [index("cron_runs_job_started_idx").on(t.job, t.startedAt)]);

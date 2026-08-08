import { eq, sql } from "drizzle-orm";
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ReviewNudgeStore, ReviewNudgeState } from "./nudge";

/**
 * One row per customer email, ever. Email is the key rather than a user id
 * because puchkaman orders are guest checkout — there is no user row to hang
 * this on, and email is the one identifier both apps always have.
 *
 * Each app re-exports this from its own schema barrel so drizzle-kit generates
 * that app's migration; the table definition itself is shared.
 */
export const reviewNudges = pgTable(
  "review_nudges",
  {
    email: text("email").primaryKey(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_nudges_sent_idx").on(t.sentAt)],
);

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

// Schema generic is loose (matches @realm/database's Database type): this
// factory only uses the core query builder, and pinning a concrete schema
// would reject every app `db` — each app has its own schema shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

/** Bind the store to an app's Drizzle client. */
export function drizzleReviewNudgeStore(db: Db): ReviewNudgeStore {
  return {
    async get(email: string): Promise<ReviewNudgeState | undefined> {
      const [row] = await db
        .select({ sentAt: reviewNudges.sentAt, doneAt: reviewNudges.doneAt })
        .from(reviewNudges)
        .where(eq(reviewNudges.email, normalize(email)))
        .limit(1);
      return row ?? undefined;
    },

    // Upsert, not read-then-write: two concurrent triggers for the same
    // customer would both see "never nudged" and both send. COALESCE keeps the
    // first timestamp, so the primary key makes a double send impossible.
    async markSent(email: string): Promise<void> {
      await db
        .insert(reviewNudges)
        .values({ email: normalize(email), sentAt: new Date() })
        .onConflictDoUpdate({
          target: reviewNudges.email,
          set: { sentAt: sql`COALESCE(${reviewNudges.sentAt}, EXCLUDED.sent_at)` },
        });
    },

    async markDone(email: string): Promise<void> {
      await db
        .insert(reviewNudges)
        .values({ email: normalize(email), doneAt: new Date() })
        .onConflictDoUpdate({
          target: reviewNudges.email,
          set: { doneAt: sql`COALESCE(${reviewNudges.doneAt}, EXCLUDED.done_at)` },
        });
    },
  };
}

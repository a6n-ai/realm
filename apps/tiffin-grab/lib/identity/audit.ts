import { stripManaged } from "@foundry/database";
import { createLogger } from "@foundry/commons/logger";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog } from "@/db/schema";

const log = createLogger("session-service");

export type AuditEntry = {
  entity: string;
  entityPublicId: string;
  operation: "create" | "update" | "delete" | "read" | "login" | "logout" | "login_failed";
  changes: Record<string, unknown> | null;
  createdBy: bigint | null;
};

// Diff the patched fields only, comparing prior vs resulting row. Managed
// fields (updatedBy/updatedAt/etc.) are never audited as changes.
export function diffChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> | null {
  const keys = Object.keys(stripManaged(patch));
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    const from = before?.[k];
    const to = after[k];
    if (from !== to) diff[k] = { from, to };
  }
  return Object.keys(diff).length ? diff : null;
}

// Best-effort persistent audit write. Raw insert (the logger cannot log through
// the audited service path), wrapped so an audit failure never breaks the
// caller's operation.
// jsonb columns go through JSON.stringify, which throws on bigint values
// (resolved FK ids like sourceId/currentOwner). Coerce bigints to strings so an
// audit blob carrying ids never fails the write. Recurse: update diffs nest the
// ids inside { from, to }, so a top-level-only pass would still throw.
function coerceBigints(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(coerceBigints);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = coerceBigints(val);
    return out;
  }
  return v;
}

function jsonSafe(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (value == null) return value;
  return coerceBigints(value) as Record<string, unknown>;
}

/** Repeat views (reads, platform bypasses) inside this window are one access, not new rows. */
export const AUDIT_REPEAT_WINDOW_MS = 10 * 60_000;

// Same actor, entity, operation and changes recorded inside the window. Served by
// audit_log_entity_idx (entity, entity_public_id, created_at).
async function recentlyRecorded(entry: AuditEntry, changes: Record<string, unknown> | null, windowMs: number) {
  const [hit] = await db
    .select({ one: sql`1` })
    .from(auditLog)
    .where(and(
      eq(auditLog.entity, entry.entity),
      eq(auditLog.entityPublicId, entry.entityPublicId),
      gt(auditLog.createdAt, Date.now() - windowMs),
      eq(auditLog.operation, entry.operation),
      entry.createdBy == null ? isNull(auditLog.createdBy) : eq(auditLog.createdBy, entry.createdBy),
      changes == null ? isNull(auditLog.changes) : sql`${auditLog.changes} = ${JSON.stringify(changes)}::jsonb`,
    ))
    .limit(1);
  return Boolean(hit);
}

/**
 * `skipRepeatWithinMs` drops a row identical to one already written in that window. Only
 * for idempotent access events; never for logins or failed logins, whose repeats are the
 * signal (brute force), nor for writes.
 */
export async function recordAudit(entry: AuditEntry, opts: { skipRepeatWithinMs?: number } = {}): Promise<void> {
  try {
    const changes = jsonSafe(entry.changes);
    if (opts.skipRepeatWithinMs && (await recentlyRecorded(entry, changes, opts.skipRepeatWithinMs))) return;
    await db.insert(auditLog).values({
      entity: entry.entity,
      entityPublicId: entry.entityPublicId,
      operation: entry.operation,
      changes,
      createdBy: entry.createdBy,
    });
  } catch (err) {
    log.error({ err }, "audit log write failed");
  }
}

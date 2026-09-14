import { BaseService, UpdatableService, stripManaged } from "@foundry/database";
import { createLogger } from "@foundry/commons/logger";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import { AUDIT_UPDATE_SKIP } from "./audit-config";

const log = createLogger("session-service");

async function sessionActorId(): Promise<bigint | null> {
  try {
    const session = await getSession();
    const publicId = session?.user?.id;
    if (!publicId) return null;
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    return row?.id ?? null;
  } catch {
    return null;
  }
}

export function currentUserId(): Promise<bigint | null> {
  return sessionActorId();
}

export type AuditEntry = {
  entity: string;
  entityPublicId: string;
  operation: "create" | "update" | "delete" | "read" | "login" | "logout" | "login_failed";
  changes: Record<string, unknown> | null;
  createdBy: bigint | null;
};

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

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      entity: entry.entity,
      entityPublicId: entry.entityPublicId,
      operation: entry.operation,
      changes: jsonSafe(entry.changes),
      createdBy: entry.createdBy,
    });
  } catch (err) {
    log.error({ err }, "audit log write failed");
  }
}

export class SessionBaseService<TTable extends PgTable> extends BaseService<TTable> {
  protected sensitive = false;

  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
  }

  async read(publicId: string): Promise<TTable["$inferSelect"]> {
    const row = await super.read(publicId);
    if (this.sensitive) {
      await recordAudit({
        entity: this.repo.tableName,
        entityPublicId: publicId,
        operation: "read",
        changes: null,
        createdBy: await this.currentUserId(),
      });
    }
    return row;
  }

  async create(values: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    const actorId = await this.currentUserId();
    const row = await super.create({ ...values, createdBy: actorId });
    await recordAudit({
      entity: this.repo.tableName,
      entityPublicId: (row as { publicId: string }).publicId,
      operation: "create",
      changes: stripManaged(values),
      createdBy: actorId,
    });
    return row;
  }

  async delete(publicId: string): Promise<number> {
    const n = await super.delete(publicId);
    await recordAudit({
      entity: this.repo.tableName,
      entityPublicId: publicId,
      operation: "delete",
      changes: null,
      createdBy: await this.currentUserId(),
    });
    return n;
  }
}

export class SessionUpdatableService<TTable extends PgTable> extends UpdatableService<TTable> {
  protected sensitive = false;

  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
  }

  async read(publicId: string): Promise<TTable["$inferSelect"]> {
    const row = await super.read(publicId);
    if (this.sensitive) {
      await recordAudit({
        entity: this.repo.tableName,
        entityPublicId: publicId,
        operation: "read",
        changes: null,
        createdBy: await this.currentUserId(),
      });
    }
    return row;
  }

  async create(values: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    const actorId = await this.currentUserId();
    const row = await super.create({ ...values, createdBy: actorId });
    await recordAudit({
      entity: this.repo.tableName,
      entityPublicId: (row as { publicId: string }).publicId,
      operation: "create",
      changes: stripManaged(values),
      createdBy: actorId,
    });
    return row;
  }

  protected redactChanges(
    changes: Record<string, { from: unknown; to: unknown }> | null,
  ): Record<string, { from: unknown; to: unknown }> | null {
    return changes;
  }

  async update(publicId: string, patch: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    const actorId = await this.currentUserId();
    if (AUDIT_UPDATE_SKIP.has(this.repo.tableName)) {
      return super.update(publicId, { ...patch, updatedBy: actorId });
    }
    const before = await this.repo.findByPublicId(publicId);
    const row = await super.update(publicId, { ...patch, updatedBy: actorId });
    const changes = this.redactChanges(
      diffChanges(before as Record<string, unknown> | null, row as Record<string, unknown>, patch),
    );
    if (changes) {
      await recordAudit({
        entity: this.repo.tableName,
        entityPublicId: (row as { publicId: string }).publicId,
        operation: "update",
        changes,
        createdBy: actorId,
      });
    }
    return row;
  }

  async delete(publicId: string): Promise<number> {
    const n = await super.delete(publicId);
    await recordAudit({
      entity: this.repo.tableName,
      entityPublicId: publicId,
      operation: "delete",
      changes: null,
      createdBy: await this.currentUserId(),
    });
    return n;
  }
}

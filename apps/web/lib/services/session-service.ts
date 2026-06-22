import { BaseService, UpdatableService, stripManaged } from "@tiffin/commons-drizzle";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { auditLog, users } from "@/db/schema";

// session.user.id is the acting user's public_id (usr_…); audit columns are
// bigint. Resolve the public_id → users internal bigint once per call so the
// service stamps createdBy/updatedBy with the internal id (null if no session).
async function sessionActorId(): Promise<bigint | null> {
  try {
    const session = await getSession();
    const publicId = session?.user?.id;
    if (!publicId) return null;
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    return row?.id ?? null;
  } catch {
    // No request context (e.g. tests/scripts) → no actor to stamp.
    return null;
  }
}

export type AuditEntry = {
  entity: string;
  entityPublicId: string;
  operation: "create" | "update" | "delete";
  changes: Record<string, unknown> | null;
  createdBy: bigint | null;
};

// Best-effort persistent audit write. Raw insert (the logger cannot log through
// the audited service path), wrapped so an audit failure never breaks the
// caller's operation.
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      entity: entry.entity,
      entityPublicId: entry.entityPublicId,
      operation: entry.operation,
      changes: entry.changes,
      createdBy: entry.createdBy,
    });
  } catch (err) {
    console.error("audit log write failed", err);
  }
}

export class SessionBaseService<TTable extends PgTable> extends BaseService<TTable> {
  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
  }

  async create(values: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    const row = await super.create(values);
    await recordAudit({
      entity: this.repo.tableName,
      entityPublicId: (row as { publicId: string }).publicId,
      operation: "create",
      changes: stripManaged(values),
      createdBy: await this.currentUserId(),
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
  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
  }

  async create(values: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    const row = await super.create(values);
    await recordAudit({
      entity: this.repo.tableName,
      entityPublicId: (row as { publicId: string }).publicId,
      operation: "create",
      changes: stripManaged(values),
      createdBy: await this.currentUserId(),
    });
    return row;
  }

  async update(publicId: string, patch: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    const row = await super.update(publicId, patch);
    await recordAudit({
      entity: this.repo.tableName,
      entityPublicId: (row as { publicId: string }).publicId,
      operation: "update",
      changes: stripManaged(patch),
      createdBy: await this.currentUserId(),
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

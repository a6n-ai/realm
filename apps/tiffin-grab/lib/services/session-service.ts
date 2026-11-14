import { BaseService, UpdatableService, stripManaged } from "@foundry/database";
import type { PgTable } from "drizzle-orm/pg-core";
import { getSession } from "@/lib/auth/session";
import { userIdByPublicId } from "@/lib/identity/user-ids";
import { diffChanges, recordAudit } from "@/lib/identity/audit";
import { AUDIT_UPDATE_SKIP } from "./audit-config";
import { rethrowNextInternal } from "@foundry/auth/next-bailout";

async function sessionActorId(): Promise<bigint | null> {
  try {
    const session = await getSession();
    const publicId = session?.user?.id;
    if (!publicId) return null;
    return await userIdByPublicId(publicId);
  } catch (err) {
    rethrowNextInternal(err);
    // No request context (e.g. tests/scripts) → no actor to stamp.
    return null;
  }
}

/** The session user's internal bigint id, or null. Resolves the publicId getSession() returns. */
export function currentUserId(): Promise<bigint | null> {
  return sessionActorId();
}

export class SessionBaseService<TTable extends PgTable> extends BaseService<TTable> {
  protected sensitive = false;

  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
  }

  async read(publicId: string): Promise<TTable["$inferSelect"]> {
    const row = await super.read(publicId);
    // A user loading their own row (every shell render does) is not a sensitive
    // access event; auditing it wrote one audit_log row per page view.
    if (this.sensitive && publicId !== (await getSession())?.user?.id) {
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

  // Overridable: shape/redact the computed {field:{from,to}} diff before it is
  // written to the audit trail. Base writes it verbatim.
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

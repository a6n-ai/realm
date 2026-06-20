import { BaseService, UpdatableService } from "@tiffin/commons-drizzle";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";

// session.user.id is the acting user's public_id (usr_…); audit columns are
// bigint. Resolve the public_id → users internal bigint once per call so the
// service stamps createdBy/updatedBy with the internal id (null if no session).
async function sessionActorId(): Promise<bigint | null> {
  try {
    const session = await auth();
    const publicId = session?.user?.id;
    if (!publicId) return null;
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    return row?.id ?? null;
  } catch {
    // No request context (e.g. tests/scripts) → no actor to stamp.
    return null;
  }
}

export class SessionBaseService<TTable extends PgTable> extends BaseService<TTable> {
  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
  }
}

export class SessionUpdatableService<TTable extends PgTable> extends UpdatableService<TTable> {
  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
  }
}

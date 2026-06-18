import { BaseService, UpdatableService } from "@tiffin/commons-drizzle";
import type { PgTable } from "drizzle-orm/pg-core";
import { auth } from "@/lib/auth";

async function sessionUserId(): Promise<string | null> {
  try {
    const session = await auth();
    return session?.user?.id ?? null;
  } catch {
    // No request context (e.g. tests/scripts) → no actor to stamp.
    return null;
  }
}

export class SessionBaseService<TTable extends PgTable> extends BaseService<TTable> {
  protected currentUserId(): Promise<string | null> {
    return sessionUserId();
  }
}

export class SessionUpdatableService<TTable extends PgTable> extends UpdatableService<TTable> {
  protected currentUserId(): Promise<string | null> {
    return sessionUserId();
  }
}

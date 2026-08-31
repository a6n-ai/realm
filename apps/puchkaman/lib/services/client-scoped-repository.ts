import { UpdatableRepository, type Database } from "@foundry/database";
import type { SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { orgScopeWhere } from "@/lib/services/org-scope";

/**
 * Base for every repository whose table carries an organizationId column.
 * The one thing it adds over UpdatableRepository: `this.scope()`, which
 * resolves the logged-in staff session's active org (or the request's
 * resolved franchise for a public caller) and returns the isNull/eq WHERE
 * condition every findAll/query override should pass to `.where(...)` —
 * a null-organizationId row is a shared/global row, visible from any org.
 *
 * Subclasses still write their own findAll()/query() overrides (the base
 * table shapes differ too much for a generic implementation here) — this
 * only centralizes *how* the org filter is computed, so every repo resolves
 * "which franchise" the exact same way instead of each hand-rolling it.
 */
export abstract class ClientScopedRepository<TTable extends PgTable> extends UpdatableRepository<TTable> {
  constructor(
    db: Database,
    table: TTable,
    publicIdColumn: PgColumn,
    internalIdColumn: PgColumn,
    protected readonly organizationIdColumn: PgColumn,
  ) {
    super(db, table, publicIdColumn, internalIdColumn);
  }

  protected scope(): Promise<SQL | undefined> {
    return orgScopeWhere(this.organizationIdColumn);
  }
}

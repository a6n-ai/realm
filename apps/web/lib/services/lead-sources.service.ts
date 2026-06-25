import { UpdatableRepository } from "@tiffin/commons-drizzle";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { leadSources, leadSubsources } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

class SoftDeleteService<TTable extends PgTable> extends SessionUpdatableService<TTable> {
  async delete(id: string): Promise<number> { await this.update(id, { active: false }); return 1; }
}

export const leadSourceService = new SoftDeleteService(new UpdatableRepository(db, leadSources, leadSources.publicId, leadSources.id));
export const leadSubsourceService = new SoftDeleteService(new UpdatableRepository(db, leadSubsources, leadSubsources.publicId, leadSubsources.id));

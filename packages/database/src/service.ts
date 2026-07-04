import type { Condition, Page, PageRequest } from "@realm/commons";
import { NotFoundError } from "@realm/commons";
import type { PgTable } from "drizzle-orm/pg-core";
import { stripManaged } from "./managed-fields";
import type { BaseRepository, UpdatableRepository } from "./repository";

export class BaseService<TTable extends PgTable> {
  constructor(protected readonly repo: BaseRepository<TTable>) {}

  // Resolves the acting user's internal bigint id for audit stamping.
  // Returns null when there is no session (e.g. tests/scripts).
  protected async currentUserId(): Promise<bigint | null> {
    return null;
  }

  async create(values: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    return this.repo.create(stripManaged(values), await this.currentUserId());
  }

  async read(publicId: string): Promise<TTable["$inferSelect"]> {
    const row = await this.repo.findByPublicId(publicId);
    if (!row) throw new NotFoundError(`Not found: ${publicId}`);
    return row;
  }

  async list(condition?: Condition, page?: PageRequest): Promise<Page<TTable["$inferSelect"]>> {
    return this.repo.findMany(condition, page);
  }

  async delete(publicId: string): Promise<number> {
    return this.repo.deleteByPublicId(publicId);
  }
}

export class UpdatableService<TTable extends PgTable> extends BaseService<TTable> {
  constructor(protected readonly repo: UpdatableRepository<TTable>) {
    super(repo);
  }

  async update(publicId: string, patch: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    const row = await this.repo.updateByPublicId(publicId, stripManaged(patch), await this.currentUserId());
    if (!row) throw new NotFoundError(`Not found: ${publicId}`);
    return row;
  }
}

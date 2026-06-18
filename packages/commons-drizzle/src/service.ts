import type { Condition, Page, PageRequest } from "@tiffin/commons";
import { NotFoundError } from "@tiffin/commons";
import type { PgTable } from "drizzle-orm/pg-core";
import type { BaseRepository, UpdatableRepository } from "./repository";

export class BaseService<TTable extends PgTable> {
  constructor(protected readonly repo: BaseRepository<TTable>) {}

  protected async currentUserId(): Promise<string | null> {
    return null;
  }

  async create(values: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    return this.repo.create(values, await this.currentUserId());
  }

  async read(id: string): Promise<TTable["$inferSelect"]> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError(`Not found: ${id}`);
    return row;
  }

  async list(condition?: Condition, page?: PageRequest): Promise<Page<TTable["$inferSelect"]>> {
    return this.repo.findMany(condition, page);
  }

  async delete(id: string): Promise<number> {
    return this.repo.delete(id);
  }
}

export class UpdatableService<TTable extends PgTable> extends BaseService<TTable> {
  constructor(protected readonly repo: UpdatableRepository<TTable>) {
    super(repo);
  }

  async update(id: string, patch: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    const row = await this.repo.update(id, patch, await this.currentUserId());
    if (!row) throw new NotFoundError(`Not found: ${id}`);
    return row;
  }
}

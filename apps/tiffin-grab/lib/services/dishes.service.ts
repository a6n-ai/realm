import { UpdatableRepository } from "@realm/database";
import { db } from "@/db/client";
import { dishes } from "@/db/schema";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";
import { SessionUpdatableService } from "./session-service";

class DishesService extends SessionUpdatableService<typeof dishes> {
  private schema = RESOURCES.dishes.schema;

  // Validate every write (incl. the soft-ref `category`) server-side, so any
  // caller — catalog editor, menu-builder inline create, seed — is held to the
  // same shape rather than trusting client-submitted fields.
  async create(values: Record<string, unknown>) {
    return super.create(this.schema.parse(values));
  }

  async update(id: string, patch: Record<string, unknown>) {
    return super.update(id, this.schema.partial().parse(patch));
  }

  async delete(id: string): Promise<number> {
    await this.update(id, { active: false });
    return 1;
  }
}
const repo = new UpdatableRepository(db, dishes, dishes.publicId, dishes.id);
export const dishesService = new DishesService(repo);

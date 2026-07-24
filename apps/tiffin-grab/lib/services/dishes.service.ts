import { and, asc, eq, isNotNull } from "drizzle-orm";
import { UpdatableRepository } from "@realm/database";
import type { FileDetail } from "@realm/storage/model";
import { db } from "@/db/client";
import { dishes } from "@/db/schema";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";
import { SessionUpdatableService } from "./session-service";

export type CustomerDish = {
  publicId: string;
  name: string;
  description: string | null;
  diet: "veg" | "nonveg";
  image: FileDetail | null;
  category: string | null;
};

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

  // Customer-facing read: active dishes that actually have a photo, for meal-size
  // slideshows. Text-only (imageless) dishes are excluded so those surfaces stay photo-driven.
  async listActiveWithImages(): Promise<CustomerDish[]> {
    const rows = await db
      .select({ publicId: dishes.publicId, name: dishes.name, description: dishes.description, diet: dishes.diet, image: dishes.image, category: dishes.category })
      .from(dishes)
      .where(and(eq(dishes.active, true), isNotNull(dishes.image)))
      .orderBy(asc(dishes.name));
    return rows.map((r) => ({ ...r, image: r.image as FileDetail }));
  }

  // Menu gallery: all active dishes — DishImage falls back to a gradient tile when
  // image is null so seed catalogs still browse like a food app.
  async listActive(): Promise<CustomerDish[]> {
    const rows = await db
      .select({ publicId: dishes.publicId, name: dishes.name, description: dishes.description, diet: dishes.diet, image: dishes.image, category: dishes.category })
      .from(dishes)
      .where(eq(dishes.active, true))
      .orderBy(asc(dishes.name));
    return rows.map((r) => ({ ...r, image: (r.image as FileDetail | null) ?? null }));
  }
}
const repo = new UpdatableRepository(db, dishes, dishes.publicId, dishes.id);
export const dishesService = new DishesService(repo);

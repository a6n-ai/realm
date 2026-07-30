import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { UpdatableRepository } from "@realm/database";
import { ValidationError } from "@realm/commons";
import type { FileDetail } from "@realm/storage/model";
import { db } from "@/db/client";
import { dishPlans, dishes, plans } from "@/db/schema";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";
import { SessionUpdatableService } from "./session-service";

export type CustomerDish = {
  publicId: string;
  name: string;
  description: string | null;
  image: FileDetail | null;
  category: string | null;
};

class DishesService extends SessionUpdatableService<typeof dishes> {
  /**
   * Replace a dish's plan membership wholesale. At least one plan is required:
   * a dish attached to nothing is invisible on every menu, which is a silent
   * failure staff would not notice until a customer complained.
   */
  async setPlans(dishPublicId: string, planPublicIds: string[]) {
    if (planPublicIds.length === 0) throw new ValidationError("Pick at least one plan for this dish");
    const [dish] = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.publicId, dishPublicId)).limit(1);
    if (!dish) throw new ValidationError("Dish not found");
    const planRows = await db.select({ id: plans.id }).from(plans).where(inArray(plans.publicId, planPublicIds));
    if (planRows.length !== planPublicIds.length) throw new ValidationError("Unknown plan");
    await db.transaction(async (tx) => {
      await tx.delete(dishPlans).where(eq(dishPlans.dishId, dish.id));
      await tx.insert(dishPlans).values(planRows.map((p) => ({ dishId: dish.id, planId: p.id })));
    });
  }

  /** Plan public ids per dish, for the admin catalog form. */
  async plansByDish(): Promise<Map<string, string[]>> {
    const rows = await db
      .select({ dishPublicId: dishes.publicId, planPublicId: plans.publicId })
      .from(dishPlans)
      .innerJoin(dishes, eq(dishes.id, dishPlans.dishId))
      .innerJoin(plans, eq(plans.id, dishPlans.planId));
    const out = new Map<string, string[]>();
    for (const r of rows) out.set(r.dishPublicId, [...(out.get(r.dishPublicId) ?? []), r.planPublicId]);
    return out;
  }

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
      .select({ publicId: dishes.publicId, name: dishes.name, description: dishes.description, image: dishes.image, category: dishes.category })
      .from(dishes)
      .where(and(eq(dishes.active, true), isNotNull(dishes.image)))
      .orderBy(asc(dishes.name));
    return rows.map((r) => ({ ...r, image: r.image as FileDetail }));
  }

  // Menu gallery: all active dishes — DishImage falls back to a gradient tile when
  // image is null so seed catalogs still browse like a food app.
  async listActive(): Promise<CustomerDish[]> {
    const rows = await db
      .select({ publicId: dishes.publicId, name: dishes.name, description: dishes.description, image: dishes.image, category: dishes.category })
      .from(dishes)
      .where(eq(dishes.active, true))
      .orderBy(asc(dishes.name));
    return rows.map((r) => ({ ...r, image: (r.image as FileDetail | null) ?? null }));
  }
}
const repo = new UpdatableRepository(db, dishes, dishes.publicId, dishes.id);
export const dishesService = new DishesService(repo);

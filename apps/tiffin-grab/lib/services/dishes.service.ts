import { eq, ne } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { dishes, plans } from "@/db/schema";
import { RESOURCES } from "@/lib/catalog/resource-config";
import { dishNameKey } from "@/lib/menu/similar-dishes";
import { SessionUpdatableService } from "./session-service";
import { parsePatch } from "./parse-patch";

class DishesService extends SessionUpdatableService<typeof dishes> {
  private schema = RESOURCES.dishes.schema;

  // Validate every write (incl. the soft-ref `category`) server-side, so any
  // caller — catalog editor, menu-builder inline create, seed — is held to the
  // same shape rather than trusting client-submitted fields. planId resolves
  // from planPublicId, the form-facing field.
  async create(values: Record<string, unknown>) {
    const { planId: planPublicId, ...rest } = this.schema.parse(values);
    await this.assertNoDuplicate(rest.name as string);
    const planId = await this.resolvePlanId(planPublicId as string);
    return super.create({ ...rest, planId });
  }

  async update(id: string, patch: Record<string, unknown>) {
    const { planId: planPublicId, ...rest } = parsePatch(this.schema, patch);
    if (typeof rest.name === "string") await this.assertNoDuplicate(rest.name, id);
    const planId = planPublicId ? await this.resolvePlanId(planPublicId as string) : undefined;
    return super.update(id, { ...rest, ...(planId ? { planId } : {}) });
  }

  // Across ALL plans, inactive included: a non-veg meal size already takes veg
  // daal/raita/roti, so a second copy on another plan is how duplicates crept in.
  private async assertNoDuplicate(name: string, exceptPublicId?: string) {
    const key = dishNameKey(name);
    const rows = await db
      .select({ name: dishes.name, active: dishes.active })
      .from(dishes)
      .where(exceptPublicId ? ne(dishes.publicId, exceptPublicId) : undefined);
    const dup = rows.find((r) => dishNameKey(r.name) === key);
    if (dup) {
      throw new ValidationError(`"${dup.name}" already exists${dup.active ? "" : " (inactive, restore it instead)"}. Use that dish.`);
    }
  }

  private async resolvePlanId(planPublicId: string) {
    const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.publicId, planPublicId)).limit(1);
    if (!plan) throw new Error("Unknown plan");
    return plan.id;
  }

  async delete(id: string): Promise<number> {
    await super.update(id, { active: false });
    return 1;
  }

}
const repo = new UpdatableRepository(db, dishes, dishes.publicId, dishes.id);
export const dishesService = new DishesService(repo);

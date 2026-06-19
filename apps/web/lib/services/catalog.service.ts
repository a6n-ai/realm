import { UpdatableRepository } from "@tiffin/commons-drizzle";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, deliveryZones, durationPackages, mealSizes, plans } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

// "Delete" retires the row (active=false) so historical orders that reference
// it stay valid; the wizard loader filters these out, the admin editor shows them.
class SoftDeleteService<TTable extends PgTable> extends SessionUpdatableService<TTable> {
  async delete(id: string): Promise<number> {
    await this.update(id, { active: false });
    return 1;
  }
}

export const planService = new SoftDeleteService(new UpdatableRepository(db, plans, plans.id));
export const mealSizeService = new SoftDeleteService(new UpdatableRepository(db, mealSizes, mealSizes.id));
export const addonService = new SoftDeleteService(new UpdatableRepository(db, addons, addons.id));
export const deliveryFrequencyService = new SoftDeleteService(new UpdatableRepository(db, deliveryFrequencies, deliveryFrequencies.id));
export const durationPackageService = new SoftDeleteService(new UpdatableRepository(db, durationPackages, durationPackages.id));
export const deliveryZoneService = new SoftDeleteService(new UpdatableRepository(db, deliveryZones, deliveryZones.id));

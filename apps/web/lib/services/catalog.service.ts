import { UpdatableRepository, UpdatableService } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { mealSizes } from "@/db/schema";

const mealSizeRepo = new UpdatableRepository(db, mealSizes, mealSizes.id);
export const mealSizeService = new UpdatableService(mealSizeRepo);

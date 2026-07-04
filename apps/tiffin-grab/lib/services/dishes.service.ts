import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { dishes } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

class DishesService extends SessionUpdatableService<typeof dishes> {
  async delete(id: string): Promise<number> {
    await this.update(id, { active: false });
    return 1;
  }
}
const repo = new UpdatableRepository(db, dishes, dishes.publicId, dishes.id);
export const dishesService = new DishesService(repo);

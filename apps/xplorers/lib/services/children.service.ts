import { AuthError, ValidationError } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { children } from "@/db/schema";
import { dayKey } from "@/lib/sessions/timezone";
import { getAppClock } from "./app-settings.service";
import { currentUserId, SessionUpdatableService } from "./session-service";

export type ChildRow = typeof children.$inferSelect;

class ChildrenService extends SessionUpdatableService<typeof children> {
  private async requireUserId(): Promise<bigint> {
    const id = await currentUserId();
    if (id === null) throw new AuthError("Sign in to manage children.");
    return id;
  }

  async listMine(): Promise<ChildRow[]> {
    const userId = await this.requireUserId();
    return db.select().from(children).where(eq(children.userId, userId)).orderBy(asc(children.createdAt));
  }

  async createMine(input: { name: string; dateOfBirth: string }): Promise<ChildRow> {
    const userId = await this.requireUserId();
    const name = input.name.trim();
    if (!name) throw new ValidationError("Child's name is required.");
    const dob = input.dateOfBirth;
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(dob) && new Date(`${dob}T00:00:00Z`).toISOString().startsWith(dob);
    if (!valid) throw new ValidationError("Date of birth is required.");
    if (dob > dayKey(new Date(), (await getAppClock()).timezone)) {
      throw new ValidationError("Date of birth can't be in the future.");
    }
    return this.create({ userId, name, dateOfBirth: dob });
  }
}

export const childrenService = new ChildrenService(new UpdatableRepository(db, children, children.publicId, children.id));

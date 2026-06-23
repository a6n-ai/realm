import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { Role, ValidationError, phoneSchema, emailSchema } from "@tiffin/commons";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";
import { pickUserWritable } from "./users-writable";

class UsersService extends SessionUpdatableService<typeof users> {
  async create(values: Record<string, unknown>) {
    return super.create(pickUserWritable(values));
  }
  async update(id: string, patch: Record<string, unknown>) {
    return super.update(id, pickUserWritable(patch));
  }

  async updateContact(userId: string, input: { phone?: string; email?: string }) {
    const [current] = await db.select().from(users).where(eq(users.publicId, userId)).limit(1);
    if (!current) throw new ValidationError("User not found");

    const patch: { phone?: string | null; email?: string | null } = {};

    if (input.phone !== undefined) {
      const phone = input.phone.trim();
      if (phone === "") {
        if (current.role === Role.USER) throw new ValidationError("Phone is required for customers");
        patch.phone = null;
      } else {
        const p = phoneSchema().safeParse(phone);
        if (!p.success) throw new ValidationError("Enter a valid phone number");
        await this.assertFree(userId, "phone", p.data);
        patch.phone = p.data;
      }
    }

    if (input.email !== undefined) {
      const raw = input.email.trim();
      if (raw === "") {
        if (current.role !== Role.USER) throw new ValidationError("Email is required for staff");
        patch.email = null;
      } else {
        const e = emailSchema.safeParse(raw);
        if (!e.success) throw new ValidationError("Enter a valid email");
        await this.assertFree(userId, "email", e.data);
        patch.email = e.data;
      }
    }

    return super.update(userId, patch);
  }

  async updateProfile(userId: string, input: { name?: string | null; image?: string | null }) {
    const patch: { name?: string | null; image?: string | null } = {};
    if (input.name !== undefined) {
      const name = (input.name ?? "").trim();
      if (name.length > 120) throw new ValidationError("Name is too long");
      patch.name = name === "" ? null : name;
    }
    if (input.image !== undefined) patch.image = input.image;
    return super.update(userId, patch);
  }

  private async assertFree(userId: string, field: "phone" | "email", value: string) {
    const col = field === "phone" ? users.phone : users.email;
    const [clash] = await db
      .select({ publicId: users.publicId })
      .from(users)
      .where(and(eq(col, value), ne(users.publicId, userId)))
      .limit(1);
    if (clash) throw new ValidationError(`That ${field} is already in use`);
  }
}

const repo = new UpdatableRepository(db, users, users.publicId, users.id);
export const usersService = new UsersService(repo);

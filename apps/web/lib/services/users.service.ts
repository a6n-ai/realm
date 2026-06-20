import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { Role, ValidationError } from "@tiffin/commons";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";
import { pickUserWritable } from "./users-writable";
import { isValidCaPhone, isValidEmail, normalizeEmail } from "./users-contact";

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
        if (!isValidCaPhone(phone)) throw new ValidationError("Invalid phone number");
        await this.assertFree(userId, "phone", phone);
        patch.phone = phone;
      }
    }

    if (input.email !== undefined) {
      const raw = input.email.trim();
      if (raw === "") {
        if (current.role !== Role.USER) throw new ValidationError("Email is required for staff");
        patch.email = null;
      } else {
        if (!isValidEmail(raw)) throw new ValidationError("Invalid email address");
        const email = normalizeEmail(raw);
        await this.assertFree(userId, "email", email);
        patch.email = email;
      }
    }

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

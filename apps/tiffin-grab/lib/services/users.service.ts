import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { Role, AuthError, ValidationError, phoneSchema, emailSchema, pinSchema } from "@tiffin/commons";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { SessionUpdatableService, recordAudit } from "./session-service";
import { pickUserWritable } from "./users-writable";

// Never let credential hashes reach the audit trail (brute-forceable), and drop
// the internal pin_attempts counter from audit noise. The real values are still
// written to the users table — only the audit `changes` is redacted.
const REDACT_FIELDS = new Set(["pinHash", "password"]);

export function redactUserChanges(
  changes: Record<string, { from: unknown; to: unknown }> | null,
): Record<string, { from: unknown; to: unknown }> | null {
  if (!changes) return changes;
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (k === "pinAttempts") continue;
    out[k] = REDACT_FIELDS.has(k) ? { from: "[redacted]", to: "[redacted]" } : v;
  }
  return Object.keys(out).length ? out : null;
}

class UsersService extends SessionUpdatableService<typeof users> {
  protected sensitive = true;

  protected redactChanges(
    changes: Record<string, { from: unknown; to: unknown }> | null,
  ): Record<string, { from: unknown; to: unknown }> | null {
    return redactUserChanges(changes);
  }

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

  async updateAddress(
    userId: string,
    input: {
      addressLine?: string | null;
      addressUnit?: string | null;
      city?: string | null;
      postalCode?: string | null;
      province?: string | null;
    },
  ) {
    const patch: {
      addressLine?: string | null;
      addressUnit?: string | null;
      city?: string | null;
      postalCode?: string | null;
      province?: string | null;
    } = {};
    const norm = (v: string | null | undefined, max: number, label: string) => {
      const s = (v ?? "").trim();
      if (s.length > max) throw new ValidationError(`${label} is too long`);
      return s === "" ? null : s;
    };
    if (input.addressLine !== undefined) patch.addressLine = norm(input.addressLine, 200, "Address");
    if (input.addressUnit !== undefined) patch.addressUnit = norm(input.addressUnit, 60, "Unit");
    if (input.city !== undefined) patch.city = norm(input.city, 120, "City");
    if (input.postalCode !== undefined) patch.postalCode = norm(input.postalCode, 20, "Postal code");
    if (input.province !== undefined) patch.province = norm(input.province, 60, "Province");
    return super.update(userId, patch);
  }

  async updatePreferences(
    userId: string,
    input: {
      dietaryNotes?: string | null;
      allergens?: string[];
      deliveryNotes?: string | null;
      notifyEmail?: boolean;
      notifySms?: boolean;
    },
  ) {
    const patch: {
      dietaryNotes?: string | null;
      allergens?: string | null;
      deliveryNotes?: string | null;
      notifyEmail?: boolean;
      notifySms?: boolean;
    } = {};
    if (input.dietaryNotes !== undefined) {
      const s = (input.dietaryNotes ?? "").trim();
      if (s.length > 1000) throw new ValidationError("Dietary notes are too long");
      patch.dietaryNotes = s === "" ? null : s;
    }
    if (input.allergens !== undefined) {
      const cleaned = input.allergens.map((a) => a.trim()).filter((a) => a !== "");
      patch.allergens = cleaned.length ? cleaned.join(",") : null;
    }
    if (input.deliveryNotes !== undefined) {
      const s = (input.deliveryNotes ?? "").trim();
      if (s.length > 1000) throw new ValidationError("Delivery notes are too long");
      patch.deliveryNotes = s === "" ? null : s;
    }
    if (input.notifyEmail !== undefined) patch.notifyEmail = input.notifyEmail;
    if (input.notifySms !== undefined) patch.notifySms = input.notifySms;
    return super.update(userId, patch);
  }

  async setPin(userId: string, currentPassword: string, newPin: string) {
    const parsed = pinSchema.safeParse(newPin);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid PIN");
    await this.assertStaff(userId);
    await this.assertPassword(userId, currentPassword);
    return super.update(userId, { pinHash: await hashPassword(parsed.data), pinAttempts: 0 });
  }

  async removePin(userId: string, currentPassword: string) {
    await this.assertStaff(userId);
    await this.assertPassword(userId, currentPassword);
    return super.update(userId, { pinHash: null, pinAttempts: 0 });
  }

  async verifyPin(userId: string, pin: string): Promise<{ ok: boolean; forcePassword?: boolean }> {
    const [u] = await db
      .select({ pinHash: users.pinHash })
      .from(users)
      .where(eq(users.publicId, userId))
      .limit(1);
    if (!u?.pinHash) {
      await recordAudit({ entity: "auth", entityPublicId: userId, operation: "login_failed", changes: { method: "pin" }, createdBy: await this.currentUserId() });
      return { ok: false };
    }
    if (await verifyPassword(pin, u.pinHash)) {
      // ponytail: counter bookkeeping — direct write, not an audited domain mutation
      await db.update(users).set({ pinAttempts: 0 }).where(eq(users.publicId, userId));
      await recordAudit({ entity: "auth", entityPublicId: userId, operation: "login", changes: { method: "pin" }, createdBy: await this.currentUserId() });
      return { ok: true };
    }
    // Wrong PIN: atomic increment + RETURNING so concurrent attempts can't both
    // read a stale count and lose increments (TOCTOU). The new value is read back
    // from the same statement, never a prior SELECT.
    const [row] = await db
      .update(users)
      .set({ pinAttempts: sql`${users.pinAttempts} + 1` })
      .where(eq(users.publicId, userId))
      .returning({ pinAttempts: users.pinAttempts });
    if ((row?.pinAttempts ?? 0) >= 5) {
      await db.update(users).set({ pinAttempts: 0 }).where(eq(users.publicId, userId));
      await recordAudit({ entity: "auth", entityPublicId: userId, operation: "login_failed", changes: { method: "pin", lockout: true }, createdBy: await this.currentUserId() });
      return { ok: false, forcePassword: true };
    }
    await recordAudit({ entity: "auth", entityPublicId: userId, operation: "login_failed", changes: { method: "pin" }, createdBy: await this.currentUserId() });
    return { ok: false };
  }

  async hasPin(userId: string): Promise<boolean> {
    const [u] = await db
      .select({ pinHash: users.pinHash })
      .from(users)
      .where(eq(users.publicId, userId))
      .limit(1);
    return Boolean(u?.pinHash);
  }

  // PIN backs the staff idle-lock; it must never exist on a customer row. The
  // render layer gates the control, but the rule lives here so the action POST
  // endpoints can't be invoked by a customer to set/clear a PIN on their own row.
  private async assertStaff(userId: string): Promise<void> {
    const [u] = await db.select({ role: users.role }).from(users).where(eq(users.publicId, userId)).limit(1);
    if (!u) throw new ValidationError("User not found");
    if (u.role !== Role.ADMIN && u.role !== Role.MEMBER) throw new AuthError();
  }

  private async assertPassword(userId: string, currentPassword: string): Promise<void> {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userId)).limit(1);
    if (!u) throw new ValidationError("User not found");
    const [acct] = await db
      .select({ password: account.password })
      .from(account)
      .where(and(eq(account.userId, u.id), eq(account.providerId, "credential")))
      .limit(1);
    if (!acct?.password || !(await verifyPassword(currentPassword, acct.password))) {
      throw new ValidationError("Password is incorrect");
    }
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

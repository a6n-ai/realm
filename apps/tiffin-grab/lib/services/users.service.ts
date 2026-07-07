import { UpdatableRepository } from "@realm/database";
import { Role, AuthError, ValidationError, phoneSchema, emailSchema, pinSchema } from "@realm/commons";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";
import { hashPassword, verifyPassword, DEFAULT_TEMP_PASSWORD } from "@/lib/auth/password";
import { SessionUpdatableService, recordAudit } from "./session-service";
import { pickUserWritable } from "./users-writable";

// Never let credential hashes reach the audit trail (brute-forceable), and drop
// the internal pin_attempts counter from audit noise. The real values are still
// written to the users table — only the audit `changes` is redacted.
const REDACT_FIELDS = new Set(["pinHash", "password"]);

// True when a unique-violation (23505) hit the username unique constraint.
function isUsernameConflict(e: unknown): boolean {
  type PgErr = { code?: string; constraint?: string; constraint_name?: string; cause?: PgErr };
  const err = e as PgErr;
  const layers = [err, err?.cause, err?.cause?.cause].filter(Boolean) as PgErr[];
  return layers.some(
    (l) => l.code === "23505" && (l.constraint ?? l.constraint_name ?? "").includes("users_username_unique"),
  );
}

// A transaction handle (the callback arg of db.transaction), for helpers that
// must write inside a caller's tx.
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

  async updateProfile(
    userId: string,
    input: { name?: string | null; image?: string | null; username?: string | null },
  ) {
    const patch: { name?: string | null; image?: string | null; username?: string | null; displayUsername?: string | null } = {};
    if (input.name !== undefined) {
      const name = (input.name ?? "").trim();
      if (name.length > 120) throw new ValidationError("Name is too long");
      patch.name = name === "" ? null : name;
    }
    if (input.image !== undefined) patch.image = input.image;
    if (input.username !== undefined) {
      const raw = (input.username ?? "").trim();
      if (raw === "") {
        patch.username = null;
        patch.displayUsername = null;
      } else {
        // Same shape the better-auth username plugin enforces: 3–30 of [a-z0-9_.].
        if (!/^[a-zA-Z0-9_.]{3,30}$/.test(raw)) {
          throw new ValidationError("Username must be 3–30 characters: letters, numbers, _ or .");
        }
        patch.username = raw.toLowerCase(); // normalized (unique key)
        patch.displayUsername = raw; // original casing
      }
    }
    try {
      return await super.update(userId, patch);
    } catch (e) {
      if (isUsernameConflict(e)) throw new ValidationError("That username is already taken");
      throw e;
    }
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

  // Write (create-or-update) the credential-provider password for an internal
  // user id. The account table carries no unique on (user_id, provider_id), so we
  // check-then-write rather than upsert. Callers own the passwordSet flag.
  private async writeCredentialPassword(tx: DbTx, userInternalId: bigint, hash: string) {
    const [acct] = await tx
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, userInternalId), eq(account.providerId, "credential")))
      .limit(1);
    if (acct) {
      await tx.update(account).set({ password: hash }).where(eq(account.id, acct.id));
    } else {
      await tx.insert(account).values({
        accountId: String(userInternalId),
        providerId: "credential",
        userId: userInternalId,
        password: hash,
      });
    }
  }

  // First-login flow: the signed-in user sets their own password, replacing the
  // issued default. No current-password prompt (they authenticated with the
  // temp one already) and no other sessions to revoke on first login, so this
  // writes the credential directly rather than routing through better-auth.
  async setOwnPassword(userId: string, newPassword: string): Promise<void> {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userId)).limit(1);
    if (!u) throw new ValidationError("User not found");
    const hash = await hashPassword(newPassword);
    await db.transaction(async (tx) => {
      await this.writeCredentialPassword(tx, u.id, hash);
      await tx.update(users).set({ passwordSet: true }).where(eq(users.id, u.id));
    });
  }

  // Admin resets a staff member back to the shared default password. Flips
  // passwordSet false so the staff member is forced to /set-password on their
  // next login. Returns the temp password for the admin to share out-of-band
  // (no email/SMS wired yet). Staff-only — never a customer row.
  async resetToDefaultPassword(userId: string): Promise<{ tempPassword: string }> {
    await this.assertStaff(userId);
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userId)).limit(1);
    if (!u) throw new ValidationError("User not found");
    const hash = await hashPassword(DEFAULT_TEMP_PASSWORD);
    await db.transaction(async (tx) => {
      await this.writeCredentialPassword(tx, u.id, hash);
      await tx.update(users).set({ passwordSet: false }).where(eq(users.id, u.id));
    });
    return { tempPassword: DEFAULT_TEMP_PASSWORD };
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

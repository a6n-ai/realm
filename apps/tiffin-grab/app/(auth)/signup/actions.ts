"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { emailSchema, passwordSchema, phoneSchema } from "@realm/commons";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

const signUpSchema = z.object({
  phone: phoneSchema(),
  email: emailSchema.optional(),
  name: z.string().trim().optional(),
  password: passwordSchema,
});

export async function signUpCustomer(input: {
  phone: string;
  email?: string;
  name?: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = signUpSchema.safeParse({
    phone: input.phone,
    email: input.email || undefined,
    name: input.name,
    password: input.password,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues;
    return { ok: false, error: issues[0]?.message ?? "Invalid input" };
  }

  const { phone, email, name, password } = parsed.data;
  // Hash outside the transaction — bcrypt is CPU-bound (~100ms) and must not hold
  // the DB connection open.
  const passwordHash = await hashPassword(password);

  try {
    return await db.transaction(async (tx) => {
      const [existingPhone] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phone, phone))
        .limit(1);

      if (existingPhone) {
        return { ok: false, error: "An account with this phone already exists." };
      }

      if (email) {
        const [existingEmail] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingEmail) {
          return { ok: false, error: "An account with this email already exists." };
        }
      }

      const [inserted] = await tx
        .insert(users)
        .values({ phone, email: email ?? null, name: name ?? null, role: "user" })
        .returning({ id: users.id });

      await tx.insert(account).values({
        accountId: String(inserted.id),
        providerId: "credential",
        userId: inserted.id,
        password: passwordHash,
      });

      return { ok: true };
    });
  } catch {
    // The explicit uniqueness checks above return the phone/email-taken messages;
    // anything reaching here is an unexpected failure (the tx has rolled back).
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

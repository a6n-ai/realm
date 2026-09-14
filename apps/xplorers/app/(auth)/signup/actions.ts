"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { emailSchema, passwordSchema } from "@foundry/commons";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

const signUpSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, "Name is required").max(120),
  password: passwordSchema,
});

export async function signUpCustomer(input: {
  email: string;
  name: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, name, password } = parsed.data;
  const passwordHash = await hashPassword(password);

  try {
    const result = await db.transaction(async (tx) => {
      const [existingEmail] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existingEmail) {
        return { ok: false as const, error: "An account with this email already exists." };
      }

      const [inserted] = await tx
        .insert(users)
        .values({
          email,
          name,
          role: "user",
          emailVerified: true,
          passwordSet: true,
        })
        .returning({ id: users.id });

      await tx.insert(account).values({
        accountId: String(inserted.id),
        providerId: "credential",
        userId: inserted.id,
        password: passwordHash,
      });

      return { ok: true as const };
    });
    return result;
  } catch {
    return { ok: false, error: "Could not create the account. Try again." };
  }
}

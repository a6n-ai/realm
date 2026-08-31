"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { emailSchema, passwordSchema, phoneSchema } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";

const log = createLogger("signup");

const signUpSchema = z.object({
  phone: phoneSchema(),
  // Required: email is the login path and the only channel for verification,
  // password reset and security alerts.
  email: emailSchema,
  name: z.string().trim().optional(),
  password: passwordSchema,
});

export async function signUpCustomer(input: {
  phone: string;
  email: string;
  name?: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = signUpSchema.safeParse({
    phone: input.phone,
    email: input.email,
    name: input.name,
    password: input.password,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues;
    return { ok: false, error: issues[0]?.message ?? "Invalid input" };
  }

  const { phone, email, name, password } = parsed.data;
  // Hash outside the transaction — scrypt is CPU-bound and must not hold the DB
  // connection open.
  const passwordHash = await hashPassword(password);

  let created = false;
  try {
    const result = await db.transaction(async (tx) => {
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
        .values({ phone, email, name: name ?? null, role: "user" })
        .returning({ id: users.id });

      await tx.insert(account).values({
        accountId: String(inserted.id),
        providerId: "credential",
        userId: inserted.id,
        password: passwordHash,
      });

      created = true;
      return { ok: true as const };
    });

    // This action writes users + account directly rather than going through
    // better-auth's /sign-up/email, so `emailVerification.sendOnSignUp` never
    // fires for it — the mail has to be sent here. Outside the transaction: a
    // slow SES call must not hold the connection, and a delivery failure must
    // not roll back a created account (the user can re-trigger by attempting to
    // sign in, which re-sends via sendOnSignIn).
    if (created) {
      try {
        const origin = (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
        await auth.api.sendVerificationEmail({
          body: { email, callbackURL: `${origin}/dashboard` },
        });
      } catch (err) {
        log.error({ err }, "signup verification email failed");
      }
    }
    return result;
  } catch {
    // The explicit uniqueness checks above return the phone/email-taken messages;
    // anything reaching here is an unexpected failure (the tx has rolled back).
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

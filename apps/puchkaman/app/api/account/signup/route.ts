import { sql } from "drizzle-orm";
import { z } from "zod";
import { clientIp, isRateLimited } from "@foundry/commons";
import { handler, json, problem } from "@foundry/routes";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { upsertCustomer } from "@/lib/customers/upsert-customer";

const schema = z.object({
  email: z.string().trim().email(),
  // Absent on the first call: the browser asks "does this address have an
  // account?" before deciding whether to show the create-account fields.
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
});

const HOUR = 60 * 60_000;
const PER_IP = 15;
const PER_EMAIL = 5;

/**
 * Customer account lookup and creation for the public site.
 *
 * Exists because email-OTP sign-in is now strict (`disableSignUp: true` in
 * lib/auth): better-auth will only issue a session for an address that already
 * has a row, and it stays silent for one that does not. So the browser asks here
 * first — a known address goes straight to "send me a code", an unknown one is
 * asked for a name and gets a row created before the code is requested.
 *
 * `known: true` does leak that an address has an account. That is the price of
 * telling a real customer "you already have an account, just sign in" instead of
 * mailing nothing and letting them guess; the per-IP throttle is what stops it
 * being usable to enumerate a list. Nothing here sends mail or sets a cookie —
 * the code still comes from better-auth's own rate-limited OTP endpoint.
 */
export const POST = handler(async (req: Request): Promise<Response> => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, "Enter a valid email address");

  const email = parsed.data.email.toLowerCase();

  const ip = clientIp(req) ?? "unknown";
  if (isRateLimited(ip, PER_IP, HOUR, "account-signup-ip")) {
    return problem(429, "Too many attempts. Try again later.");
  }
  if (isRateLimited(email, PER_EMAIL, HOUR, "account-signup-email")) {
    return problem(429, "Too many attempts for this email. Try again later.");
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (existing) return json({ known: true, created: false });

  // No name yet: this was the "do I have an account?" probe. Answer it without
  // writing anything — a row is only ever created by an explicit submit that
  // carries a name.
  if (!parsed.data.name) return json({ known: false, created: false });

  await db.transaction((tx) =>
    upsertCustomer(tx, {
      email,
      name: parsed.data.name ?? null,
      phone: parsed.data.phone ?? null,
    }),
  );

  return json({ known: true, created: true });
});

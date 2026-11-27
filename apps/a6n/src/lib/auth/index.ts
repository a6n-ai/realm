import { newId } from "@foundry/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "../../db/client";
import { accounts, rateLimits, sessions, users, verifications } from "../../db/schema";
import type { Env } from "../../env";

const ID_PREFIX: Record<string, string> = {
  user: "usr",
  session: "ses",
  account: "acc",
  verification: "ver",
  rateLimit: "rlm",
};

export function prefixFor(model: string): string {
  const prefix = ID_PREFIX[model];
  if (!prefix) throw new Error(`no id prefix for Better Auth model "${model}"`);
  return prefix;
}

export function createAuth(env: Env) {
  if (!env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is missing");
  if (!env.BETTER_AUTH_URL) throw new Error("BETTER_AUTH_URL is missing");
  return betterAuth({
    appName: "a6n CRM",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(getDb(env), {
      provider: "sqlite",
      schema: { user: users, session: sessions, account: accounts, verification: verifications, rateLimit: rateLimits },
    }),
    advanced: { database: { generateId: ({ model }) => newId(prefixFor(model)) } },
  });
}

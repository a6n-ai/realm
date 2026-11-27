import { getTableColumns } from "drizzle-orm";
import { admin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";
import { getAuthTables } from "better-auth/db";
import type { BetterAuthOptions } from "better-auth";
import { describe, expect, test } from "vitest";
import { accounts, rateLimits, sessions, users, verifications } from "../schema";

// Mirror of createAuth's plugins and the adapter's singular schema map.
const options = {
  rateLimit: { storage: "database" },
  plugins: [admin(), emailOTP({ sendVerificationOTP: async () => {} })],
} satisfies BetterAuthOptions;

const schemaMap: Record<string, object> = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
  rateLimit: rateLimits,
};

const COMPATIBLE: Record<string, string[]> = {
  string: ["string"],
  boolean: ["boolean"],
  number: ["number", "bigint"],
  date: ["date", "number"],
};

describe("Better Auth schema coverage", () => {
  const authTables = getAuthTables(options);

  test("every Better Auth model is mapped", () => {
    for (const key of Object.keys(authTables)) expect(schemaMap, `model ${key}`).toHaveProperty(key);
  });

  for (const [key, def] of Object.entries(authTables)) {
    test(`${key}: every field has a compatible column`, () => {
      const cols = getTableColumns(schemaMap[key] as never) as Record<string, { dataType: string; notNull: boolean; hasDefault: boolean }>;
      for (const [field, attr] of Object.entries(def.fields)) {
        const col = cols[field];
        expect(col, `${key}.${field} missing`).toBeDefined();
        expect(COMPATIBLE[attr.type as string], `${key}.${field} unknown type ${String(attr.type)}`).toContain(col.dataType);
        if (attr.required !== false) expect(col.notNull, `${key}.${field} must be notNull`).toBe(true);
        else if (col.notNull) expect(col.hasDefault, `${key}.${field} notNull needs a default`).toBe(true);
      }
    });
  }
});

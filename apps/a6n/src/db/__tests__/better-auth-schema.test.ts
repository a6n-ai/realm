import { env } from "cloudflare:test";
import { getTableColumns } from "drizzle-orm";
import { getAuthTables } from "better-auth/db";
import { describe, expect, test } from "vitest";
import { authOptions, authSchemaMap as typedMap } from "../../lib/auth";

const COMPATIBLE: Record<string, string[]> = {
  string: ["string"],
  boolean: ["boolean"],
  number: ["number", "bigint"],
  date: ["date", "number"],
};

const schemaMap: Record<string, object> = typedMap;

describe("Better Auth schema coverage", () => {
  const authTables = getAuthTables(authOptions(env));

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

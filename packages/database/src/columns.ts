import { sql } from "drizzle-orm";
import { bigint, text } from "drizzle-orm/pg-core";
import { customAlphabet } from "nanoid";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
const nano = customAlphabet(ALPHABET, 12);

export function makePublicId(prefix: string): () => string {
  if (!/^[a-z]{3}$/.test(prefix)) {
    throw new Error(`id prefix must be exactly 3 lowercase letters, got "${prefix}"`);
  }
  return () => `${prefix}_${nano()}`;
}

export function baseColumns(prefix: string) {
  return {
    id: bigint("id", { mode: "bigint" }).primaryKey().default(sql`next_id()`),
    publicId: text("public_id").notNull().unique().$defaultFn(makePublicId(prefix)),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    createdBy: bigint("created_by", { mode: "bigint" }),
  };
}

export function updatableColumns(prefix: string) {
  return {
    ...baseColumns(prefix),
    updatedAt: bigint("updated_at", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now())
      .$onUpdate(() => Date.now()),
    updatedBy: bigint("updated_by", { mode: "bigint" }),
  };
}

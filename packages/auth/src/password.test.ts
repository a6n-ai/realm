import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { hashPassword, isLegacyHash, verifyPassword } from "./password";

const PLAIN = "correct-horse-battery-staple";

describe("password hashing (bcrypt → scrypt cutover)", () => {
  it("writes new hashes as scrypt, not bcrypt", async () => {
    const hash = await hashPassword(PLAIN);
    expect(hash.startsWith("$2")).toBe(false);
    expect(isLegacyHash(hash)).toBe(false);
    expect(await verifyPassword(PLAIN, hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  // The whole point of the dual-format verify: every account hashed before the
  // cutover must still be able to sign in. If this breaks, so does every
  // existing user at once.
  it("still verifies pre-cutover bcrypt hashes", async () => {
    const legacy = await bcrypt.hash(PLAIN, 10);
    expect(isLegacyHash(legacy)).toBe(true);
    expect(await verifyPassword(PLAIN, legacy)).toBe(true);
    expect(await verifyPassword("wrong", legacy)).toBe(false);
  });

  it("recognises every bcrypt variant as legacy", () => {
    for (const h of ["$2a$10$abc", "$2b$10$abc", "$2y$12$abc"]) {
      expect(isLegacyHash(h)).toBe(true);
    }
    // scrypt is "<salt-hex>:<hash-hex>" — no leading $
    expect(isLegacyHash("deadbeef:cafebabe")).toBe(false);
  });

  it("salts: the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([hashPassword(PLAIN), hashPassword(PLAIN)]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(PLAIN, a)).toBe(true);
    expect(await verifyPassword(PLAIN, b)).toBe(true);
  });
});

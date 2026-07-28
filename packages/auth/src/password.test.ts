import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

const PLAIN = "correct-horse-battery-staple";

describe("password hashing (scrypt)", () => {
  it("hashes to scrypt, never plaintext or bcrypt", async () => {
    const hash = await hashPassword(PLAIN);
    expect(hash).not.toBe(PLAIN);
    expect(hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(hash).not.toMatch(/^\$2[aby]\$/);
  });

  it("round-trips the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword(PLAIN);
    expect(await verifyPassword(PLAIN, hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("salts: the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([hashPassword(PLAIN), hashPassword(PLAIN)]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(PLAIN, a)).toBe(true);
    expect(await verifyPassword(PLAIN, b)).toBe(true);
  });

  // bcrypt support is gone; a stale hash must fail closed rather than throw.
  it("rejects a legacy bcrypt hash instead of crashing", async () => {
    const legacy = "$2b$10$JNPi3ia9w9BkjJXhHA3s/eLV05yzvLY48Mk13ZMhIvXuqkSpJ/ZAm";
    await expect(verifyPassword(PLAIN, legacy)).resolves.toBe(false);
  });
});

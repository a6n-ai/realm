import { describe, expect, it } from "vitest";
import { betterAuthPassword, hashPassword, verifyPassword } from "../password";

describe("password hashing", () => {
  it("hashes to a non-plaintext scrypt string", async () => {
    const hash = await hashPassword("Tiffin123!dev");
    expect(hash).not.toBe("Tiffin123!dev");
    // scrypt is "<salt-hex>:<hash-hex>"; bcrypt's "$2a$…" is no longer supported.
    expect(hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(hash).not.toMatch(/^\$2[aby]\$/);
  });
  it("verifies a correct password", async () => {
    const hash = await hashPassword("Tiffin123!dev");
    expect(await verifyPassword("Tiffin123!dev", hash)).toBe(true);
  });
  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Tiffin123!dev");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("betterAuthPassword", () => {
  it("hashes with scrypt and round-trips", async () => {
    const hash = await betterAuthPassword.hash("hunter2hunter2");
    expect(hash).not.toMatch(/^\$2[aby]\$/);
    expect(await betterAuthPassword.verify({ hash, password: "hunter2hunter2" })).toBe(true);
    expect(await betterAuthPassword.verify({ hash, password: "wrong" })).toBe(false);
  });

  // bcrypt support is gone: a stale hash must fail closed, not throw.
  it("rejects a legacy bcrypt hash without crashing", async () => {
    const legacy = "$2b$10$JNPi3ia9w9BkjJXhHA3s/eLV05yzvLY48Mk13ZMhIvXuqkSpJ/ZAm";
    await expect(betterAuthPassword.verify({ hash: legacy, password: "hunter2" })).resolves.toBe(false);
  });
});

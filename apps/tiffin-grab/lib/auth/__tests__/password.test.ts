import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword } from "../password";
import { betterAuthPassword } from "../password";

describe("password hashing", () => {
  it("hashes to a non-plaintext bcrypt string", async () => {
    const hash = await hashPassword("Tiffin123");
    expect(hash).not.toBe("Tiffin123");
    expect(hash).toMatch(/^\$2[aby]\$/);
  });
  it("verifies a correct password", async () => {
    const hash = await hashPassword("Tiffin123");
    expect(await verifyPassword("Tiffin123", hash)).toBe(true);
  });
  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Tiffin123");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("betterAuthPassword", () => {
  it("verifies a legacy bcryptjs hash", async () => {
    const hash = await bcrypt.hash("hunter2", 10);
    expect(await betterAuthPassword.verify({ hash, password: "hunter2" })).toBe(true);
    expect(await betterAuthPassword.verify({ hash, password: "wrong" })).toBe(false);
  });
  it("hashes with bcryptjs and round-trips", async () => {
    const hash = await betterAuthPassword.hash("hunter2");
    expect(await betterAuthPassword.verify({ hash, password: "hunter2" })).toBe(true);
  });
});

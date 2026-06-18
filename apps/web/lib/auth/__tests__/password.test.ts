import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password";

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

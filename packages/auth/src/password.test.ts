import { describe, expect, it, vi, beforeEach } from "vitest";

// pino writes straight to fd 1, so a console spy sees nothing — mock the logger factory.
const error = vi.fn();
vi.mock("@realm/commons/logger", () => ({
  createLogger: () => ({ error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const { hashPassword, verifyPassword } = await import("./password");

const PLAIN = "correct-horse-battery-staple";

beforeEach(() => error.mockClear());

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

  it("a plain wrong password is NOT logged as an error — that is a user typo, not a fault", async () => {
    const hash = await hashPassword(PLAIN);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });
});

// An unreadable hash fails closed exactly like a wrong password, which is correct but
// indistinguishable from a typo. These pin the diagnosis that tells them apart.
describe("unreadable stored hashes fail closed AND say so", () => {
  const unreadable: [string, string, string][] = [
    ["legacy bcrypt", "$2b$10$JNPi3ia9w9BkjJXhHA3s/eLV05yzvLY48Mk13ZMhIvXuqkSpJ/ZAm", "bcrypt"],
    ["empty", "", "empty"],
    ["garbage", "not-a-hash", "unrecognised"],
    ["plaintext left in the column", PLAIN, "unrecognised"],
  ];

  for (const [name, stored, expectedFormat] of unreadable) {
    it(`rejects ${name} without throwing, and logs which format it found`, async () => {
      await expect(verifyPassword(PLAIN, stored)).resolves.toBe(false);
      expect(error).toHaveBeenCalledTimes(1);
      const [meta, message] = error.mock.calls[0];
      expect(meta.hashFormat).toContain(expectedFormat);
      expect(message).toMatch(/cannot be verified|corrupt/);
    });
  }

  it("never logs the password or the stored hash, not even a prefix", async () => {
    const secret = "$2b$10$JNPi3ia9w9BkjJXhHA3s/eLV05yzvLY48Mk13ZMhIvXuqkSpJ/ZAm";
    await verifyPassword(PLAIN, secret);
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toContain(PLAIN);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain(secret.slice(0, 12));
  });
});

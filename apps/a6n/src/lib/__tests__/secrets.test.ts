import { describe, expect, it } from "vitest";
import { readSecret } from "../secrets";

describe("readSecret", () => {
  it("passes plain strings through and treats empty as unset", async () => {
    expect(await readSecret("abc")).toBe("abc");
    expect(await readSecret("")).toBeUndefined();
    expect(await readSecret(undefined)).toBeUndefined();
  });
  it("awaits a Secrets Store binding", async () => {
    expect(await readSecret({ get: async () => "from-store" })).toBe("from-store");
  });
  it("lets a missing store secret throw", async () => {
    await expect(readSecret({ get: () => Promise.reject(new Error("secret not found")) })).rejects.toThrow("secret not found");
  });
});

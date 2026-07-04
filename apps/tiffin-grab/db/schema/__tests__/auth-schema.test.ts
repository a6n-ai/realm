import { describe, expect, it } from "vitest";
import { account, session, users, verification } from "@/db/schema";

describe("better auth schema", () => {
  it("exposes session/account/verification tables", () => {
    expect(session).toBeDefined();
    expect(account).toBeDefined();
    expect(verification).toBeDefined();
  });
  it("account stores the credential password and references a bigint user id", () => {
    expect(account).toHaveProperty("password");
    expect(account).toHaveProperty("userId");
  });
  it("users carries boolean phoneVerified for the phoneNumber plugin", () => {
    expect(users).toHaveProperty("phoneVerified");
  });
  it("auth tables follow house conventions: publicId + created/updated timestamps", () => {
    for (const t of [session, account, verification]) {
      expect(t).toHaveProperty("publicId");
      expect(t).toHaveProperty("createdAt");
      expect(t).toHaveProperty("updatedAt");
    }
  });
});

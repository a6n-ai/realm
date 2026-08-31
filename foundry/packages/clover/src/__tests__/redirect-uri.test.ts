import { describe, expect, it } from "vitest";
import { cloverOAuthRedirectUri } from "../redirect-uri";

describe("cloverOAuthRedirectUri", () => {
  it("builds callback URL from BETTER_AUTH_URL", () => {
    expect(
      cloverOAuthRedirectUri({ BETTER_AUTH_URL: "https://shop.example/" } as NodeJS.ProcessEnv),
    ).toBe("https://shop.example/api/integrations/clover/callback");
  });

  it("falls back to NEXT_PUBLIC_BETTER_AUTH_URL", () => {
    expect(
      cloverOAuthRedirectUri({
        NEXT_PUBLIC_BETTER_AUTH_URL: "http://localhost:3000",
      } as NodeJS.ProcessEnv),
    ).toBe("http://localhost:3000/api/integrations/clover/callback");
  });

  it("throws when origin is missing", () => {
    expect(() => cloverOAuthRedirectUri({} as NodeJS.ProcessEnv)).toThrow(/BETTER_AUTH_URL/);
  });
});

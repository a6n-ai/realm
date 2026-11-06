import { afterEach, describe, expect, it, vi } from "vitest";
import { publicOrigin } from "../apex";

describe("publicOrigin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("drops app. so canonicals name the apex", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.tiffingrab.ca");
    expect(publicOrigin()).toBe("https://tiffingrab.ca");
  });

  it("keeps hosts without app. as they are", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    expect(publicOrigin()).toBe("http://localhost:3000");
  });
});

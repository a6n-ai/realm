import { describe, expect, it, vi } from "vitest";

// Warm-up pings hit this; touching Postgres would wake Neon each time.
vi.mock("@/db/client", () => {
  throw new Error("health route must not import the database");
});

describe("GET /api/health", () => {
  it("answers ok without a session or database", async () => {
    const { GET } = await import("./route");
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

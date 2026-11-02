import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyRealtimeToken } from "@foundry/realtime";

const authorizeChannel = vi.fn();
vi.mock("@/lib/realtime/authorize", () => ({ authorizeChannel: (c: string) => authorizeChannel(c) }));

import { GET } from "./route";

const SECRET = "s".repeat(32);
const call = (qs = "?channel=notify:u1") => GET(new Request(`http://x/api/realtime/token${qs}`));

describe("token route", () => {
  beforeEach(() => {
    vi.stubEnv("REALTIME_URL", "https://rt.example");
    vi.stubEnv("REALTIME_SECRET", SECRET);
    authorizeChannel.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns 404 when REALTIME_URL is unset", async () => {
    vi.stubEnv("REALTIME_URL", "");
    expect((await call()).status).toBe(404);
  });

  it("returns 404 when the secret is shorter than 32 chars", async () => {
    vi.stubEnv("REALTIME_SECRET", "short");
    expect((await call()).status).toBe(404);
  });

  it("returns 400 without channel", async () => {
    expect((await call("")).status).toBe(400);
  });

  it("returns 403 when authorizeChannel denies", async () => {
    authorizeChannel.mockResolvedValue(null);
    expect((await call()).status).toBe(403);
  });

  it("returns url and a token that verifies for the authorized channel", async () => {
    authorizeChannel.mockResolvedValue({ channel: "notify:u1", userId: "u1", role: "customer" });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { url: string; token: string };
    expect(body.url).toBe("https://rt.example");
    expect(await verifyRealtimeToken(SECRET, body.token)).toMatchObject({ c: "notify:u1", u: "u1", r: "customer" });
  });
});

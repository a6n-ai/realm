import { beforeEach, describe, expect, it, vi } from "vitest";

const handle = vi.fn();
vi.mock("@relay/engine", async (orig) => ({
  ...(await orig<typeof import("@relay/engine")>()),
  handleUnsubscribe: (...args: unknown[]) => handle(...args),
}));

const { GET } = await import("./route");

beforeEach(() => {
  handle.mockClear();
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
});

describe("GET /api/unsubscribe", () => {
  it("returns the same response for a valid and an invalid token", async () => {
    const a = await GET(new Request("https://x.test/api/unsubscribe?address=a@x.com&token=deadbeef"));
    const b = await GET(new Request("https://x.test/api/unsubscribe?address=nobody@x.com&token=zz"));
    expect(a.status).toBe(b.status);
    expect(await a.text()).toBe(await b.text());
  });

  it("returns 200 even with no parameters at all", async () => {
    const res = await GET(new Request("https://x.test/api/unsubscribe"));
    expect(res.status).toBe(200);
  });

  it("passes the address and token through to the handler", async () => {
    await GET(new Request("https://x.test/api/unsubscribe?address=a@x.com&token=abcd"));
    expect(handle).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ address: "a@x.com", token: "abcd", secret: "test-secret" }),
    );
  });

  it("does nothing when no secret is configured", async () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    const res = await GET(new Request("https://x.test/api/unsubscribe?address=a@x.com&token=abcd"));
    expect(res.status).toBe(200);
    expect(handle).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({ getGaConfig: vi.fn(), openApiSecret: vi.fn() }));
vi.mock("../../meta-pixel/config", () => ({ getMetaPixelConfig: vi.fn(), openAccessToken: vi.fn() }));

import { buildMpBody, clientIdFromGaCookie } from "../mp";
import { gaScript } from "../ids";
import { gaEventFor } from "../../tracking";

describe("GA measurement protocol", () => {
  it("reads client_id from the _ga cookie", () => {
    expect(clientIdFromGaCookie("GA1.1.123456.1700000000")).toBe("123456.1700000000");
    expect(clientIdFromGaCookie("junk")).toBeNull();
    expect(clientIdFromGaCookie(undefined)).toBeNull();
  });

  it("falls back to a stable per-user client_id without a browser", () => {
    const body = buildMpBody({ clientId: null, userId: "42", event: { name: "purchase" } });
    expect(body.client_id).toBe("42.0");
    expect(body.user_id).toBe("42");
  });

  it("maps a Purchase to GA's purchase with transaction_id", () => {
    const e = gaEventFor({
      eventName: "Purchase",
      eventId: "purchase:p1",
      user: {},
      customData: { value: 150, currency: "CAD", order_id: "ord_1" },
    });
    expect(e).toEqual({ name: "purchase", params: { transaction_id: "ord_1", value: 150, currency: "CAD", method: undefined } });
  });

  it("only interpolates a GA4-shaped ID", () => {
    expect(gaScript('G-1");alert(1)//')).toBe("");
    expect(gaScript("G-AB12CD34EF")).toContain('gtag("config","G-AB12CD34EF")');
  });
});

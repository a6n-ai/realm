import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog/load", () => ({ invalidateCatalogSnapshot: async () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
const requireAdmin = vi.fn(async () => undefined);
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: () => requireAdmin() }));
const setTracked = vi.fn(async (_: string[]) => undefined);
vi.mock("@/lib/notifications/tracked-email-events", () => ({ setTrackedEmailEvents: (e: string[]) => setTracked(e) }));
const setRouting = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@relay/email", async (orig) => ({ ...(await orig<object>()), sesEventSettings: () => ({ setRouting }) }));
vi.mock("@/lib/email/provider", () => ({
  emailStreams: () => [{ id: "marketing", label: "Marketing", configSet: "m", kind: "marketing" }],
}));

const { saveTrackedTypes, saveStreamRouting } = await import("../actions");

beforeEach(() => vi.clearAllMocks());

describe("saveStreamRouting", () => {
  it("returns a safe {error} and does not touch tracked_email_events when SES fails", async () => {
    setRouting.mockRejectedValueOnce(new Error("AccessDenied: ses:UpdateConfigurationSetEventDestination"));
    const res = await saveStreamRouting("marketing", { webhook: ["delivery"] });
    expect(res).toHaveProperty("error");
    expect(JSON.stringify(res)).not.toContain("AccessDenied");
    expect(setTracked).not.toHaveBeenCalled();
  });

  it("rejects unknown streams and malformed routing without calling SES", async () => {
    expect(await saveStreamRouting("nope", { webhook: [] })).toHaveProperty("error");
    expect(await saveStreamRouting("marketing", { webhook: ["OPEN"] })).toHaveProperty("error");
    expect(setRouting).not.toHaveBeenCalled();
  });

  it("passes valid routing to SES", async () => {
    expect(await saveStreamRouting("marketing", { webhook: ["delivery"], counts: ["open"] })).toEqual({ ok: true });
    expect(setRouting).toHaveBeenCalledOnce();
  });

  it("rejects non-admins", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    expect(await saveStreamRouting("marketing", { webhook: [] })).toHaveProperty("error");
    expect(setRouting).not.toHaveBeenCalled();
  });
});

describe("saveTrackedTypes", () => {
  it("strips account events", async () => {
    await saveTrackedTypes(["order_created", "signup"]);
    expect(setTracked).toHaveBeenCalledWith(["order_created"]);
  });

  it("drops events the app does not know", async () => {
    await saveTrackedTypes(["order_created", "bogus_event"]);
    expect(setTracked).toHaveBeenCalledWith(["order_created"]);
  });

  it("returns a safe {error} when saving throws", async () => {
    setTracked.mockRejectedValueOnce(new Error("arn:aws:iam::123456789012:role/x"));
    const res = await saveTrackedTypes(["order_created"]);
    expect(res).toHaveProperty("error");
    expect(JSON.stringify(res)).not.toContain("123456789012");
  });

  it("rejects non-admins", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    expect(await saveTrackedTypes(["order_created"])).toHaveProperty("error");
    expect(setTracked).not.toHaveBeenCalled();
  });
});

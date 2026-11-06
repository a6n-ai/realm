import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
const requireAdmin = vi.fn(async () => undefined);
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: () => requireAdmin() }));
const setTracked = vi.fn(async (_: string[]) => undefined);
vi.mock("@/lib/services/app-settings.service", () => ({ setTrackedEmailEvents: (e: string[]) => setTracked(e) }));
const setRouting = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@relay/email", async (orig) => ({ ...(await orig<object>()), sesEventSettings: () => ({ setRouting }) }));
vi.mock("@/lib/email/provider", () => ({
  emailStreams: () => [{ id: "marketing", label: "Marketing", configSet: "m", kind: "marketing" }],
}));

const { saveTrackedTypes, saveStreamRouting } = await import("../actions");

beforeEach(() => vi.clearAllMocks());

describe("saveStreamRouting", () => {
  it("returns {error} and does not touch tracked_email_events when SES fails", async () => {
    setRouting.mockRejectedValueOnce(new Error("AccessDenied: ses:UpdateConfigurationSetEventDestination"));
    const res = await saveStreamRouting("marketing", { webhook: ["delivery"] });
    expect(res.error).toContain("AccessDenied");
    expect(setTracked).not.toHaveBeenCalled();
  });

  it("rejects unknown streams and malformed routing without calling SES", async () => {
    expect((await saveStreamRouting("nope", { webhook: [] })).error).toBeTruthy();
    expect((await saveStreamRouting("marketing", { webhook: ["OPEN"] })).error).toBeTruthy();
    expect(setRouting).not.toHaveBeenCalled();
  });

  it("passes valid routing to SES", async () => {
    expect(await saveStreamRouting("marketing", { webhook: ["delivery"], counts: ["open"] })).toEqual({});
    expect(setRouting).toHaveBeenCalledOnce();
  });

  it("rejects non-admins", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    await expect(saveStreamRouting("marketing", { webhook: [] })).rejects.toThrow("forbidden");
    expect(setRouting).not.toHaveBeenCalled();
  });
});

describe("saveTrackedTypes", () => {
  it("strips account events", async () => {
    await saveTrackedTypes(["order_created", "signup"]);
    expect(setTracked).toHaveBeenCalledWith(["order_created"]);
  });

  it("rejects non-admins", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    await expect(saveTrackedTypes(["order_created"])).rejects.toThrow("forbidden");
    expect(setTracked).not.toHaveBeenCalled();
  });
});

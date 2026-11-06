import { beforeEach, describe, expect, it, vi } from "vitest";

const { tracked, events } = vi.hoisted(() => ({
  tracked: vi.fn(),
  events: vi.fn(),
}));
vi.mock("@/lib/email/provider", () => ({
  getEmailProvider: () => ({ id: "default" }),
  getMarketingEmailProvider: () => ({ id: "marketing" }),
  getTrackedEmailProvider: tracked,
}));
vi.mock("@/lib/services/app-settings.service", () => ({ getTrackedEmailEvents: events }));

import { emailProviderFor } from "../email-provider-for";

const trackedProvider = { send: vi.fn(), id: "tracked" };

beforeEach(() => {
  vi.clearAllMocks();
  tracked.mockReturnValue(trackedProvider);
});

describe("emailProviderFor", () => {
  it("tracked event gets the tracked provider", async () => {
    events.mockResolvedValue(["order_confirmed"]);
    expect(await emailProviderFor("order_confirmed")).toBe(trackedProvider);
  });

  it("untracked event falls through to the default", async () => {
    events.mockResolvedValue(["order_confirmed"]);
    expect(await emailProviderFor("wallet_credited")).toBeUndefined();
  });

  it("account event is never tracked even if in the set", async () => {
    events.mockResolvedValue(["otp_login"]);
    expect(await emailProviderFor("otp_login")).toBeUndefined();
  });

  it("empty event is untracked", async () => {
    events.mockResolvedValue(["", "order_confirmed"]);
    expect(await emailProviderFor("")).toBeUndefined();
    expect(await emailProviderFor(null as unknown as string)).toBeUndefined();
  });

  it("falls back to untracked when no tracked config set is configured", async () => {
    tracked.mockReturnValue(undefined);
    events.mockResolvedValue(["order_confirmed"]);
    expect(await emailProviderFor("order_confirmed")).toBeUndefined();
  });

  it("set is read at send time: removing a key takes effect on the next send", async () => {
    events.mockResolvedValueOnce(["order_confirmed"]).mockResolvedValueOnce([]);
    expect(await emailProviderFor("order_confirmed")).toBe(trackedProvider);
    expect(await emailProviderFor("order_confirmed")).toBeUndefined();
    expect(events).toHaveBeenCalledTimes(2);
  });
});

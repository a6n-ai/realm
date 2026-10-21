// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WIZARD_STORAGE_KEY } from "@/components/wizard/selections";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { PAID_KEY, markPaid, useBounceAfterPaid } from "../paid-flag";

function Page() {
  const bouncing = useBounceAfterPaid();
  return bouncing ? null : <p>step UI</p>;
}

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/checkout");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("markPaid", () => {
  it("clears the wizard, stamps tg:paid and leaves the URL alone", () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, "{}");
    const push = vi.spyOn(window.history, "pushState");
    markPaid("SUB-1");
    expect(sessionStorage.getItem(WIZARD_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(PAID_KEY)!)).toMatchObject({ deploymentId: "SUB-1" });
    expect(window.location.pathname).not.toBe("/me/deliveries");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("useBounceAfterPaid", () => {
  it("a revisited entry (back) after paying replaces to /me/deliveries", () => {
    window.history.replaceState({ tgSeen: true }, "");
    sessionStorage.setItem(PAID_KEY, JSON.stringify({ deploymentId: "SUB-1", at: 1 }));
    render(<Page />);
    expect(router.replace).toHaveBeenCalledWith("/me/deliveries");
    expect(screen.queryByText("step UI")).toBeNull();
  });

  it("a bfcache restore or popstate after paying bounces", () => {
    render(<Page />);
    sessionStorage.setItem(PAID_KEY, JSON.stringify({ deploymentId: "SUB-1", at: 1 }));
    act(() => { window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })); });
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("step UI")).toBeNull();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(router.replace).toHaveBeenCalledTimes(2);
  });

  it("a normal forward visit clears the flag and does not redirect", () => {
    sessionStorage.setItem(PAID_KEY, JSON.stringify({ deploymentId: "SUB-1", at: 1 }));
    render(<Page />);
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByText("step UI")).toBeTruthy();
    expect(sessionStorage.getItem(PAID_KEY)).toBeNull();
  });

  it("does nothing when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => render(<Page />)).not.toThrow();
    expect(router.replace).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

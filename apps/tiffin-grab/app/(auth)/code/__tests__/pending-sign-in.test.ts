import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPendingSignIn, rememberPendingSignIn, takePendingSignIn } from "../pending-sign-in";

// Node's own localStorage global is a no-op without --localstorage-file; stub a real one.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

describe("pending sign-in marker", () => {
  afterEach(() => {
    vi.useRealTimers();
    clearPendingSignIn();
  });

  it("is read back in the same browser", () => {
    rememberPendingSignIn("a@b.co", "/me");
    expect(takePendingSignIn()).toEqual({ email: "a@b.co", callbackUrl: "/me" });
  });

  it("expires with the code (10 min)", () => {
    vi.useFakeTimers();
    rememberPendingSignIn("a@b.co", null);
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(takePendingSignIn()).toBeNull();
  });

  it("is absent on another device", () => {
    expect(takePendingSignIn()).toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

const { lockSession, push } = vi.hoisted(() => ({
  lockSession: vi.fn().mockResolvedValue(undefined),
  push: vi.fn(),
}));
vi.mock("@/lib/auth/lock-actions", () => ({ lockSession }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { IdleLock } from "../idle-lock";

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); lockSession.mockClear(); });

describe("IdleLock", () => {
  it("locks the session after the idle threshold elapses", async () => {
    vi.useFakeTimers();
    render(<IdleLock thresholdMs={1000} />);
    expect(lockSession).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1001);
    expect(lockSession).toHaveBeenCalledTimes(1);
  });
});

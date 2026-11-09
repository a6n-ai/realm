// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedAsync } from "../use-debounced-async";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDebouncedAsync", () => {
  it("waits out the delay and settles for the current key", async () => {
    const fn = vi.fn(async () => "a");
    const { result } = renderHook(() => useDebouncedAsync("k", fn, 100, "none"));
    expect(fn).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current).toMatchObject({ key: "k", value: "a" });
  });

  it("never runs for a null key", async () => {
    const fn = vi.fn(async () => "a");
    renderHook(() => useDebouncedAsync(null, fn, 10, "none"));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(fn).not.toHaveBeenCalled();
  });

  it("drops a slow result once the key has moved on, and settles a rejection as empty", async () => {
    let resolveFirst!: (v: string) => void;
    const fn = vi.fn((): Promise<string> => (fn.mock.calls.length === 1 ? new Promise((r) => { resolveFirst = r; }) : Promise.reject(new Error("x"))));
    const { result, rerender } = renderHook(({ k }) => useDebouncedAsync(k, fn, 10, "none"), { initialProps: { k: "one" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    rerender({ k: "two" });
    await act(async () => { resolveFirst("late"); await vi.advanceTimersByTimeAsync(10); });
    expect(result.current).toMatchObject({ key: "two", value: "none" });
  });
});

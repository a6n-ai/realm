import { afterEach, describe, expect, it, vi } from "vitest";
import { runInBackground } from "./background";

describe("runInBackground", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never throws and logs a rejection with its label", async () => {
    const err = new Error("boom");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => runInBackground(() => Promise.reject(err), "bell")).not.toThrow();
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith("bell", err));
  });

  it("runs the task exactly once", async () => {
    const task = vi.fn(() => Promise.resolve());
    runInBackground(task, "once");
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(1));
  });
});

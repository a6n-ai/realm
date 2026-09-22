import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "@foundry/commons";

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const release = vi.fn();
const markReady = vi.fn();
vi.mock("@/lib/services/menu.service", () => ({
  menuService: {
    release: (...args: unknown[]) => release(...args),
    markReady: (...args: unknown[]) => markReady(...args),
    upsertWeek: vi.fn(),
    saveWeek: vi.fn(),
    amendImpact: vi.fn(),
    releaseProblems: vi.fn(),
    backToDraft: vi.fn(),
    copyWeek: vi.fn(),
  },
}));
vi.mock("@/lib/services/dishes.service", () => ({
  dishesService: { create: vi.fn() },
}));

import { releaseWeek, markReady as markReadyAction } from "../actions";

// Thrown errors are redacted to "Minified React error #441" in production, so
// expected validation failures must come back as { error } the builder can show.
describe("menu actions", () => {
  it("releaseWeek returns { error } when the week is already released", async () => {
    release.mockRejectedValueOnce(new ValidationError("This menu is already released"));
    const res = await releaseWeek("mw_test");
    expect(res).toEqual({ error: "This menu is already released" });
  });

  it("markReady returns { error } when the week is not a draft", async () => {
    markReady.mockRejectedValueOnce(new ValidationError("Only a draft can be marked ready"));
    const res = await markReadyAction("mw_test");
    expect(res).toEqual({ error: "Only a draft can be marked ready" });
  });
});

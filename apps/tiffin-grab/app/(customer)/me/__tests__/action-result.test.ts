import { describe, expect, it, vi } from "vitest";
import { AppError, AuthError, ForbiddenError, ValidationError } from "@foundry/commons";
import { MealRuleViolationError } from "@/lib/menu/meal-rule-error";
import { runAction } from "../action-result";

describe("runAction", () => {
  it("returns { ok: true } when void function succeeds", async () => {
    const res = await runAction(async () => {});
    expect(res).toEqual({ ok: true });
  });

  it("returns { ok: true, message } when function returns a string", async () => {
    const res = await runAction(async () => "Done successfully");
    expect(res).toEqual({ ok: true, message: "Done successfully" });
  });

  it("returns { ok: true, ...data } when function returns an object", async () => {
    const res = await runAction(async () => ({ publicId: "order_123" }));
    expect(res).toEqual({ ok: true, publicId: "order_123" });
  });

  it("handles ValidationError returning { error }", async () => {
    const res = await runAction(async () => {
      throw new ValidationError("Name is required");
    });
    expect(res).toEqual({ error: "Name is required" });
  });

  it("handles generic AppError returning { error }", async () => {
    const res = await runAction(async () => {
      throw new AppError("Resource conflict", 409);
    });
    expect(res).toEqual({ error: "Resource conflict" });
  });

  it("handles AuthError returning friendly session expired error", async () => {
    const res = await runAction(async () => {
      throw new AuthError();
    });
    expect(res).toEqual({ error: "Session expired. Please log in again." });
  });

  it("handles ForbiddenError returning friendly forbidden error", async () => {
    const res = await runAction(async () => {
      throw new ForbiddenError();
    });
    expect(res).toEqual({ error: "You do not have permission to perform this action." });
  });

  it("handles MealRuleViolationError returning error and violatedRuleId", async () => {
    const res = await runAction(async () => {
      throw new MealRuleViolationError("Max portions exceeded", "rule_max_tu");
    });
    expect(res).toEqual({ error: "Max portions exceeded", violatedRuleId: "rule_max_tu" });
  });

  it("catches unexpected exceptions, logs to console, and returns friendly error instead of re-throwing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runAction(async () => {
      throw new Error("Neon Postgres query timed out");
    });
    expect(res).toEqual({ error: "Unable to complete request. Please try again." });
    expect(spy).toHaveBeenCalledWith(
      "[runAction unexpected error]",
      expect.any(Error),
    );
    spy.mockRestore();
  });

  it("re-throws NEXT_REDIRECT errors so Next.js navigation continues to work", async () => {
    const redirectErr = { digest: "NEXT_REDIRECT;replace;/dashboard;307;" };
    await expect(
      runAction(async () => {
        throw redirectErr;
      }),
    ).rejects.toEqual(redirectErr);
  });
});

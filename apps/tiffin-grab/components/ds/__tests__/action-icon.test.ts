import { describe, expect, it } from "vitest";
import { orgDefaultStatements } from "@foundry/auth";
import { appStatement } from "@/lib/auth/permissions";
import { ACTION_ICONS } from "../action-icon";

describe("ACTION_ICONS", () => {
  it("has an explicit icon for every app and Better Auth org action", () => {
    const actions = new Set([...Object.values(appStatement), ...Object.values(orgDefaultStatements)].flat());
    for (const action of actions) expect(ACTION_ICONS, action).toHaveProperty(action);
  });
});

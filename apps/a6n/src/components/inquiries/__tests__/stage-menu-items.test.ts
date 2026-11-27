import { describe, expect, test } from "vitest";
import { STAGES } from "../../../lib/inquiries/stages";
import { pickStage, stageMenuModel } from "../stage-menu-items";

describe("stageMenuModel", () => {
  test("an open inquiry lists every stage in order and no reopen", () => {
    expect(stageMenuModel("negotiating")).toEqual({ stages: STAGES, reopen: false });
  });
  test("a closed inquiry offers only reopen", () => {
    for (const s of ["won", "lost"]) expect(stageMenuModel(s)).toEqual({ stages: [], reopen: true });
  });
});

describe("pickStage", () => {
  test("the current stage does nothing", () => expect(pickStage("new", "new")).toBe("noop"));
  test("lost and won need a dialog first", () => {
    expect(pickStage("new", "lost")).toBe("lost");
    expect(pickStage("new", "won")).toBe("won");
  });
  test("other open stages change at once", () => expect(pickStage("new", "contacted")).toBe("change"));
});

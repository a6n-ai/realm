import { describe, expect, it } from "vitest";
import { activePresetKey, applyPreset, managedKeys, type FilterPreset } from "../presets";

const presets: FilterPreset[] = [
  { key: "mine", label: "My follow-ups", params: { queue: "due", owner: "usr_me" } },
  { key: "new", label: "New", params: { subStatus: "none" } },
];
const managed = managedKeys(presets, ["subStatus", "owner", "source"]);

describe("filter presets", () => {
  it("collects facet fields and preset keys once", () => {
    expect(managed.sort()).toEqual(["owner", "queue", "source", "subStatus"]);
  });

  it("apply clears other picks and page, keeps search and dates", () => {
    const sp = applyPreset(new URLSearchParams("source=web&page=3&q=ram&from=1"), presets[0], managed);
    expect(Object.fromEntries(sp)).toEqual({ q: "ram", from: "1", queue: "due", owner: "usr_me" });
  });

  it("apply null resets to the default view", () => {
    expect(applyPreset(new URLSearchParams("queue=due&owner=usr_me&q=x"), null, managed).toString()).toBe("q=x");
  });

  it("active only on an exact match of managed keys", () => {
    expect(activePresetKey(new URLSearchParams("queue=due&owner=usr_me&q=x"), presets, managed)).toBe("mine");
    expect(activePresetKey(new URLSearchParams("queue=due&owner=usr_me&source=web"), presets, managed)).toBeNull();
    expect(activePresetKey(new URLSearchParams(""), presets, managed)).toBeNull();
  });
});

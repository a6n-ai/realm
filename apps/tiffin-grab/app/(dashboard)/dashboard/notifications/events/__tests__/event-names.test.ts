import { describe, expect, it } from "vitest";
import { EMAIL_EVENT_TYPES } from "@relay/email/events/types";
import { EVENT_NAME, STREAM_NAME, routingChanges, trackedChanges } from "../event-names";

describe("event-names", () => {
  it("names every event type and stream kind", () => {
    for (const t of EMAIL_EVENT_TYPES) expect(EVENT_NAME[t]).toBeTruthy();
    expect(STREAM_NAME).toEqual({ untracked: "Standard emails", tracked: "Tracked emails", marketing: "Campaigns" });
  });

  it("lists tracking changes in plain words", () => {
    const label = (e: string) => e.toUpperCase();
    expect(trackedChanges(["a", "b"], ["b", "c"], label)).toEqual(["C: tracking on", "A: tracking off"]);
    expect(trackedChanges(["a"], ["a"], label)).toEqual([]);
  });

  it("lists routing changes, ignoring forced removals and a missing counts set", () => {
    const before = { webhook: ["bounce", "send"] as const, counts: null };
    const after = { webhook: ["open"] as const, counts: null };
    expect(routingChanges(before, after, ["bounce"])).toEqual(["Opened: shown in Logs on", "Sent: shown in Logs off"]);
    expect(routingChanges({ webhook: [], counts: ["send"] }, { webhook: [], counts: ["send", "click"] }, [])).toEqual(["Clicked: counted in totals on"]);
  });
});

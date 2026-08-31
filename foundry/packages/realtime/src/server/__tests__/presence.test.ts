import { describe, expect, it } from "vitest";
import { PresenceStore } from "../presence";

describe("PresenceStore", () => {
  it("tracks join/leave per channel with ref-counting across tabs", () => {
    const p = new PresenceStore();
    p.join("ticket:1", "u1", "customer");
    p.join("ticket:1", "u1", "customer"); // second tab
    expect(p.online("ticket:1").map((o) => o.userId)).toEqual(["u1"]);
    p.leave("ticket:1", "u1"); // one tab closes
    expect(p.online("ticket:1")).toHaveLength(1); // still online (other tab)
    p.leave("ticket:1", "u1"); // last tab closes
    expect(p.online("ticket:1")).toHaveLength(0);
  });

  it("isolates channels", () => {
    const p = new PresenceStore();
    p.join("ticket:1", "u1", "staff");
    expect(p.online("ticket:2")).toEqual([]);
  });
});

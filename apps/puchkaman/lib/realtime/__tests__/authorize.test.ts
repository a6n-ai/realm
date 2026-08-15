import { describe, expect, it } from "vitest";
import { parseNotifyChannel } from "@/lib/realtime/authorize";

describe("parseNotifyChannel", () => {
  it("extracts the user public id", () => {
    expect(parseNotifyChannel("notify:usr_abc123")).toBe("usr_abc123");
  });

  it("rejects a channel of another kind", () => {
    expect(parseNotifyChannel("ticket:tkt_abc")).toBeNull();
  });

  it("rejects a malformed channel", () => {
    expect(parseNotifyChannel("notify:")).toBeNull();
    expect(parseNotifyChannel("notify")).toBeNull();
    expect(parseNotifyChannel("")).toBeNull();
  });

  it("rejects an id with a separator in it", () => {
    expect(parseNotifyChannel("notify:usr_a:usr_b")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { unreadCount } from "../unread";

describe("unreadCount", () => {
  it("counts tickets whose latest staff reply is newer than the customer's last look", () => {
    const replies = { tkt_a: 200, tkt_b: 100, tkt_c: 300 };
    expect(unreadCount(replies, { tkt_a: 250, tkt_b: 50 })).toBe(2); // b replied after look, c never opened
  });
  it("nothing unread once every ticket has been opened since its last reply", () => {
    expect(unreadCount({ tkt_a: 200 }, { tkt_a: 200 })).toBe(0);
    expect(unreadCount({}, {})).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { metaPixelBootstrap } from "../pixel-bootstrap";

describe("metaPixelBootstrap", () => {
  it("returns empty for missing or non-digit ids", () => {
    expect(metaPixelBootstrap(null)).toBe("");
    expect(metaPixelBootstrap('1");alert(1)//')).toBe("");
  });

  it("inits the pixel and fires PageView with eventID plus a CAPI beacon", () => {
    const script = metaPixelBootstrap("123456789");
    expect(script).toContain('fbq("init","123456789")');
    expect(script).toContain('fbq("track","PageView",{},{eventID:eid})');
    expect(script).toContain("/api/meta/events");
    expect(script).toContain('eventName:"PageView"');
    // Bare PageView without eventID would break Meta dedupe coverage.
    expect(script).not.toMatch(/fbq\("track","PageView"\);/);
  });
});

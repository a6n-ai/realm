import { describe, expect, it } from "vitest";
import {
  hashMetaField,
  normalizeCity,
  normalizeEmail,
  normalizePhone,
  normalizePostal,
  normalizeProvince,
  splitPersonName,
} from "../hash";

describe("meta hash helpers", () => {
  it("normalizes email and hashes", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(hashMetaField("")).toBeUndefined();
    expect(hashMetaField("   ")).toBeUndefined();
    expect(hashMetaField(normalizeEmail("Ada@Example.COM"))).toBe(
      "b5fc85e55755f9e0d030a10ab4429b6b2944855f9a0d60077fe832becbc41d72",
    );
  });

  it("normalizes Canadian phones with country code", () => {
    expect(normalizePhone("(416) 555-1234")).toBe("14165551234");
    expect(normalizePhone("+1 416 555 1234")).toBe("14165551234");
    expect(normalizePhone("14165551234")).toBe("14165551234");
    expect(normalizePhone("")).toBeUndefined();
  });

  it("normalizes city, province, postal", () => {
    expect(normalizeCity("Toronto")).toBe("toronto");
    expect(normalizeCity("North York")).toBe("northyork");
    expect(normalizeProvince("ON")).toBe("on");
    expect(normalizeProvince("Ontario")).toBeUndefined();
    expect(normalizePostal("M5V 3L9")).toBe("m5v3l9");
  });

  it("splits names into fn/ln", () => {
    expect(splitPersonName("Ada Lovelace")).toEqual({ fn: "ada", ln: "lovelace" });
    expect(splitPersonName("Madonna")).toEqual({ fn: "madonna" });
    expect(splitPersonName("  ")).toEqual({});
  });
});

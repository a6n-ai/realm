import { describe, it, expect } from "vitest";
import { emailSchema, normalizeEmail, phoneSchema, tzToDefaultCountry } from "./contact";

describe("emailSchema", () => {
  it("accepts and normalizes a valid email", () => {
    expect(emailSchema.parse("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
  it("rejects a malformed email", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
  it("matches emailSchema normalization", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe(emailSchema.parse("  Foo@Bar.COM "));
  });
});

describe("phoneSchema", () => {
  it("accepts a national CA number and outputs E.164", () => {
    expect(phoneSchema("CA").parse("647 555 0100")).toBe("+16475550100");
  });
  it("accepts an already-E.164 number regardless of default country", () => {
    expect(phoneSchema("IN").parse("+16475550100")).toBe("+16475550100");
  });
  it("accepts a national IN number with IN default", () => {
    expect(phoneSchema("IN").parse("9833098330")).toBe("+919833098330");
  });
  it("rejects garbage", () => {
    expect(phoneSchema("CA").safeParse("12").success).toBe(false);
  });
  it("defaults to CA when no country given", () => {
    expect(phoneSchema().parse("647 555 0100")).toBe("+16475550100");
  });
});

describe("tzToDefaultCountry", () => {
  it("maps Canadian zones to CA", () => {
    expect(tzToDefaultCountry("America/Toronto")).toBe("CA");
    expect(tzToDefaultCountry("America/Vancouver")).toBe("CA");
  });
  it("maps Asia/Kolkata to IN", () => {
    expect(tzToDefaultCountry("Asia/Kolkata")).toBe("IN");
  });
  it("falls back to CA for UTC / unknown", () => {
    expect(tzToDefaultCountry("UTC")).toBe("CA");
    expect(tzToDefaultCountry("Europe/Paris")).toBe("CA");
  });
});

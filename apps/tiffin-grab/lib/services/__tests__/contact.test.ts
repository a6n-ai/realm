import { describe, expect, it } from "vitest";
import { parseCustomerContact, parsePhone } from "../contact";

describe("parsePhone", () => {
  it("uses the given default country for a national number", () => {
    expect(parsePhone("6475551234", "CA")).toBe("+16475551234");
    expect(parsePhone("07911 123456", "GB")).toBe("+447911123456");
  });

  it("parseCustomerContact threads the country through", () => {
    expect(parseCustomerContact({ phone: "07911 123456", email: "a@b.co" }, "GB").phone).toBe("+447911123456");
  });
});

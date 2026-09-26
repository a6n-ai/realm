import { describe, expect, it } from "vitest";
import { emailDomainSuggestions } from "../email-domains";

describe("emailDomainSuggestions", () => {
  it("waits for a local part and an @", () => {
    expect(emailDomainSuggestions("priya")).toEqual([]);
    expect(emailDomainSuggestions("@gm")).toEqual([]);
  });

  it("offers every common domain right after @", () => {
    expect(emailDomainSuggestions("priya@")).toContain("priya@gmail.com");
    expect(emailDomainSuggestions("priya@")).toHaveLength(5);
  });

  it("narrows by what is typed and stops once complete", () => {
    expect(emailDomainSuggestions("priya@Ho")).toEqual(["priya@hotmail.com"]);
    expect(emailDomainSuggestions("priya@gmail.com")).toEqual([]);
    expect(emailDomainSuggestions("priya@work.ca")).toEqual([]);
  });
});

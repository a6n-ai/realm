import { describe, expect, it } from "vitest";
import { agentModelSchema } from "./index";

describe("agentModelSchema", () => {
  it("accepts a named provider + model id", () => {
    expect(agentModelSchema.parse({ provider: "openai", id: "gpt-5" })).toEqual({
      provider: "openai",
      id: "gpt-5",
    });
  });
});

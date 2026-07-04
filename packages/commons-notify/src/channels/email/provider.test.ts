import { describe, expect, it } from "vitest";
import { ValidationError } from "@realm/commons";
import { AbstractEmailProvider, type EmailProviderConfig } from "./provider";
import type { PreparedEmail, SendResult } from "./types";

class FakeProvider extends AbstractEmailProvider {
  readonly name = "fake";
  last?: PreparedEmail;
  constructor(config: EmailProviderConfig) {
    super(config);
  }
  protected async deliver(message: PreparedEmail): Promise<SendResult> {
    this.last = message;
    return { providerMessageId: "id-1", provider: this.name };
  }
}

const config: EmailProviderConfig = { defaultFrom: { email: "noreply@tiffingrab.ca", name: "Tiffin Grab" } };

describe("AbstractEmailProvider", () => {
  it("applies the default sender when from is omitted", async () => {
    const p = new FakeProvider(config);
    await p.send({ to: { email: "a@b.com" }, subject: "Hi", text: "body" });
    expect(p.last?.from).toEqual(config.defaultFrom);
  });

  it("normalizes recipient email (trim + lowercase)", async () => {
    const p = new FakeProvider(config);
    await p.send({ to: { email: "  A@B.COM " }, subject: "Hi", text: "body" });
    expect(p.last?.to).toEqual({ email: "a@b.com" });
  });

  it("rejects a message with no body", async () => {
    const p = new FakeProvider(config);
    await expect(p.send({ to: { email: "a@b.com" }, subject: "Hi" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an invalid recipient", async () => {
    const p = new FakeProvider(config);
    await expect(p.send({ to: { email: "nope" }, subject: "Hi", text: "x" })).rejects.toBeInstanceOf(ValidationError);
  });
});

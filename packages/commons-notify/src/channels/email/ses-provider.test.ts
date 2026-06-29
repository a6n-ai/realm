import { describe, expect, it, vi } from "vitest";
import type { SendEmailCommand, SendEmailCommandOutput } from "@aws-sdk/client-sesv2";
import { AppError } from "@tiffin/commons";
import { SesEmailProvider, type SesSendClient } from "./ses-provider";

const defaultFrom = { email: "noreply@tiffingrab.ca", name: "Tiffin Grab" };

function fakeClient(out: Partial<SendEmailCommandOutput> = { MessageId: "ses-1" }) {
  const sent: SendEmailCommand[] = [];
  const client: SesSendClient = {
    send: vi.fn(async (cmd: SendEmailCommand) => {
      sent.push(cmd);
      return out as SendEmailCommandOutput;
    }),
  };
  return { client, sent };
}

describe("SesEmailProvider", () => {
  it("maps a message to a SESv2 SendEmail command and returns the MessageId", async () => {
    const { client, sent } = fakeClient();
    const p = new SesEmailProvider({ defaultFrom, client, configurationSetName: "tg-events" });

    const res = await p.send({
      to: { email: "cust@example.com", name: "Cust" },
      subject: "Order confirmed",
      html: "<p>hi</p>",
    });

    expect(res).toEqual({ providerMessageId: "ses-1", provider: "ses" });
    const input = sent[0].input;
    expect(input.FromEmailAddress).toBe("Tiffin Grab <noreply@tiffingrab.ca>");
    expect(input.Destination?.ToAddresses).toEqual(["Cust <cust@example.com>"]);
    expect(input.ConfigurationSetName).toBe("tg-events");
    expect(input.Content?.Simple?.Body?.Html?.Data).toBe("<p>hi</p>");
    expect(input.Content?.Simple?.Body?.Text).toBeUndefined();
  });

  it("throws when SES returns no MessageId", async () => {
    const { client } = fakeClient({ MessageId: undefined });
    const p = new SesEmailProvider({ defaultFrom, client });
    await expect(
      p.send({ to: { email: "a@b.com" }, subject: "x", text: "y" }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

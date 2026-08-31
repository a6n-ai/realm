import { describe, expect, it, vi } from "vitest";
import { buildHandlers, resolveRecipientAddress } from "./handlers";

/**
 * Minimal fake db: dispatches `.select().from(table).where()` by table
 * identity, since buildHandlers only ever awaits that chain directly (no
 * further chaining) for both the user lookup and the template lookup.
 */
function fakeDb(rowsByTable: Map<object, unknown[]>) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (_cols: unknown) => ({
      from: (table: object) => ({
        where: async (_cond: unknown) => rowsByTable.get(table) ?? [],
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("buildHandlers — email — marketing footer on event-template rows", () => {
  const usersTable = { locale: "locale-col" };
  const templateTable = {};
  const userRow = { email: "customer@example.test", phone: null, locale: "en" };
  const templateRows = [
    {
      channel: "email",
      locale: "en",
      subject: "Finish your order",
      body: null,
      html: "<p>You left items in your cart</p>",
      text: "You left items in your cart",
      providerTemplateId: null,
      enabled: true,
    },
  ];

  function setup() {
    const db = fakeDb(
      new Map<object, unknown[]>([
        [usersTable, [userRow]],
        [templateTable, templateRows],
      ]),
    );
    const send = vi.fn().mockResolvedValue({ providerMessageId: "pid" });
    const handlers = buildHandlers({
      db,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tables: { notificationTemplate: templateTable } as any,
      users: { table: usersTable, columns: { id: "id-col", email: "email-col" } },
      providers: { email: { send } },
      broadcast: vi.fn(),
      campaigns: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tables: {} as any,
        unsubscribe: { baseUrl: "https://recover.test", secret: "shh" },
        sender: { name: "Puchkaman", postalAddress: "123 Main St" },
      },
    });
    return { handlers, send };
  }

  function row(kind: string) {
    return {
      recipientId: 7n,
      recipientEmail: null,
      recipientPhone: null,
      campaignId: null,
      event: "cart_abandoned",
      kind,
      payload: { href: null, vars: {} },
    };
  }

  it("appends the unsubscribe footer to a marketing-kind event email", async () => {
    const { handlers, send } = setup();
    await handlers.email!(row("marketing"));
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0][0];
    expect(sent.html).toContain("Unsubscribe");
    expect(sent.html).toContain("Puchkaman");
    expect(sent.text).toContain("Unsubscribe: https://recover.test/unsubscribe");
  });

  it("does not append a footer to a transactional-kind event email", async () => {
    const { handlers, send } = setup();
    await handlers.email!(row("transactional"));
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0][0];
    expect(sent.html).not.toContain("Unsubscribe");
  });
});

describe("resolveRecipientAddress", () => {
  it("prefers the literal address on the row", async () => {
    const load = vi.fn();
    const got = await resolveRecipientAddress(
      { recipientId: 7n, recipientEmail: "row@x.com", recipientPhone: null },
      "email",
      load,
    );
    expect(got).toEqual({ address: "row@x.com", locale: "en" });
    expect(load).not.toHaveBeenCalled();
  });

  it("falls back to the user row when no literal address is stored", async () => {
    const load = vi.fn().mockResolvedValue({ email: "user@x.com", phone: null, locale: "fr" });
    const got = await resolveRecipientAddress(
      { recipientId: 7n, recipientEmail: null, recipientPhone: null },
      "email",
      load,
    );
    expect(got).toEqual({ address: "user@x.com", locale: "fr" });
  });

  it("returns null when neither source has an address", async () => {
    const load = vi.fn().mockResolvedValue({ email: null, phone: null, locale: "en" });
    const got = await resolveRecipientAddress(
      { recipientId: 7n, recipientEmail: null, recipientPhone: null },
      "email",
      load,
    );
    expect(got).toBeNull();
  });

  it("uses the phone column for sms", async () => {
    const got = await resolveRecipientAddress(
      { recipientId: null, recipientEmail: null, recipientPhone: "+14165550134" },
      "sms",
      vi.fn(),
    );
    expect(got).toEqual({ address: "+14165550134", locale: "en" });
  });
});

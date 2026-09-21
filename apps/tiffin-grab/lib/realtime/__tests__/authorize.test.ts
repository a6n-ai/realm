import { beforeEach, describe, expect, it, vi } from "vitest";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => (session.user ? { user: session.user } : null),
}));

vi.mock("@/lib/services/tickets.service", () => ({
  ticketsService: {
    assertReadable: vi.fn(async () => undefined),
  },
}));

const { authorizeChannel } = await import("../authorize");
const { ticketsService } = await import("@/lib/services/tickets.service");
const assertReadable = vi.mocked(ticketsService.assertReadable);

describe("authorizeChannel", () => {
  beforeEach(() => {
    session.user = null;
    assertReadable.mockReset();
    assertReadable.mockResolvedValue(undefined);
  });

  it("rejects anonymous callers", async () => {
    expect(await authorizeChannel("tickets:inbox")).toBeNull();
  });

  it("allows staff on tickets:inbox", async () => {
    session.user = { id: "usr_staff", role: "member" };
    await expect(authorizeChannel("tickets:inbox")).resolves.toEqual({
      channel: "tickets:inbox",
      userId: "usr_staff",
      role: "staff",
    });
  });

  it("rejects customers on tickets:inbox", async () => {
    session.user = { id: "usr_cust", role: "user" };
    expect(await authorizeChannel("tickets:inbox")).toBeNull();
  });

  it("allows admin on payments:inbox", async () => {
    session.user = { id: "usr_admin", role: "admin" };
    await expect(authorizeChannel("payments:inbox")).resolves.toEqual({
      channel: "payments:inbox",
      userId: "usr_admin",
      role: "staff",
    });
  });

  it("rejects members on payments:inbox", async () => {
    session.user = { id: "usr_member", role: "member" };
    expect(await authorizeChannel("payments:inbox")).toBeNull();
  });

  it("still gates ticket:<id> via assertReadable", async () => {
    session.user = { id: "usr_staff", role: "admin" };
    assertReadable.mockRejectedValueOnce(new Error("nope"));
    expect(await authorizeChannel("ticket:tkt_x")).toBeNull();

    assertReadable.mockResolvedValueOnce(undefined);
    await expect(authorizeChannel("ticket:tkt_x")).resolves.toMatchObject({
      channel: "ticket:tkt_x",
      role: "staff",
    });
  });
});

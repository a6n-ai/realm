import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const session = vi.hoisted(() => ({ value: null as null | { user: { id: string; role: string } } }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => session.value }));
const acceptInvite = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/services/friends.service", () => ({ friendsService: { acceptInvite } }));

const { GET } = await import("../route");
const ORIGIN = "http://localhost:3002";
const REF = "priya.s-0123456789ab";
const req = (ref: string) => new NextRequest(`${ORIGIN}/join?ref=${encodeURIComponent(ref)}`);

beforeEach(() => {
  session.value = null;
  acceptInvite.mockClear();
});

describe("/join", () => {
  it("signed out: keeps the ref in a cookie and sends them to sign up", async () => {
    const res = await GET(req("Priya.S-0123456789AB"));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/signup`);
    expect(res.cookies.get("friend_ref")?.value).toBe(REF);
    expect(res.cookies.get("friend_ref")?.httpOnly).toBe(true);
  });

  it("drops junk and bare usernames", async () => {
    for (const bad of ["<script>", "priya.s"]) {
      const res = await GET(req(bad));
      expect(res.cookies.get("friend_ref")).toBeUndefined();
    }
  });

  it("signed-in customer: never befriends on a GET, asks on the Friends page instead", async () => {
    session.value = { user: { id: "usr_me", role: "user" } };
    const res = await GET(req(REF));
    expect(acceptInvite).not.toHaveBeenCalled();
    expect(res.cookies.get("friend_ref")?.value).toBe(REF);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/me/friends`);
  });

  it("staff get no invite cookie", async () => {
    session.value = { user: { id: "usr_staff", role: "admin" } };
    const res = await GET(req(REF));
    expect(res.cookies.get("friend_ref")).toBeUndefined();
  });
});

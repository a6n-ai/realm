import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@foundry/commons";

vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "usr_friend_search", role: "user" } }) }));
const svc = vi.hoisted(() => ({
  search: vi.fn(async () => [{ publicId: "usr_b", displayUsername: "b", name: "B", image: null, relation: "none" }]),
  request: vi.fn(async () => {
    throw new NotFoundError("We couldn't find that customer");
  }),
  acceptInvite: vi.fn(async () => true),
  previewInvite: vi.fn(async () => null),
}));
vi.mock("@/lib/services/friends.service", () => ({ friendsService: svc }));
const jar = vi.hoisted(() => ({ value: "ana-0123456789ab" as string | undefined, deleted: false }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (jar.value ? { value: jar.value } : undefined),
    delete: () => {
      jar.deleted = true;
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { searchFriendsAction, friendAction, acceptInviteAction, dismissInviteAction } = await import("../actions");

describe("friends actions", () => {
  it("search returns people without contact details, and is rate-limited", async () => {
    const first = await searchFriendsAction("bb");
    expect(first.rows[0]).not.toHaveProperty("email");
    for (let i = 0; i < 40; i++) await searchFriendsAction(`q${i}`);
    expect((await searchFriendsAction("again")).error).toMatch(/too many/i);
  });

  it("a request to someone who isn't a family comes back as an error, not a crash", async () => {
    expect(await friendAction("request", "usr_staff")).toEqual({ error: "We couldn't find that customer" });
  });

  it("a request reports the resulting relation so the UI can show Friends, not Requested", async () => {
    svc.request.mockResolvedValueOnce("friends" as never);
    expect(await friendAction("request", "usr_b")).toEqual({ relation: "friends" });
  });

  it("rejects an unknown action kind", async () => {
    await expect(friendAction("drop" as never, "usr_b")).rejects.toThrow();
  });

  it("accepting a waiting invite befriends and clears the cookie", async () => {
    await acceptInviteAction();
    expect(svc.acceptInvite).toHaveBeenCalledWith("usr_friend_search", "ana-0123456789ab");
    expect(jar.deleted).toBe(true);
  });

  it("Not now clears the cookie without befriending", async () => {
    svc.acceptInvite.mockClear();
    jar.deleted = false;
    await dismissInviteAction();
    expect(svc.acceptInvite).not.toHaveBeenCalled();
    expect(jar.deleted).toBe(true);
  });
});

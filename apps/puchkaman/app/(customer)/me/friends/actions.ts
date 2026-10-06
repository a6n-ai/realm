"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isRateLimited, NotFoundError, Role, ValidationError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { REF_COOKIE, REF_RE } from "@/lib/friends/ref-cookie";
import { friendsService } from "@/lib/services/friends.service";

const SEARCH_LIMIT = 30;
const SEARCH_WINDOW_MS = 60_000;
// Server actions take client input: never index the service with a raw string.
const KINDS = ["request", "accept", "decline", "remove"] as const;
type Kind = (typeof KINDS)[number];

async function viewer(): Promise<string> {
  const s = await getSession();
  if (!s || s.user.role !== Role.USER) throw new ValidationError("Sign in to use friends");
  return s.user.id;
}

export async function searchFriendsAction(q: string) {
  const me = await viewer();
  if (isRateLimited(me, SEARCH_LIMIT, SEARCH_WINDOW_MS, "friend-search")) {
    return { rows: [], error: "Too many searches. Try again in a minute." };
  }
  return { rows: await friendsService.search(me, String(q)) };
}

export async function friendAction(kind: Kind, publicId: string): Promise<{ error?: string }> {
  if (!KINDS.includes(kind)) throw new ValidationError("Unknown action");
  const me = await viewer();
  try {
    await friendsService[kind](me, String(publicId));
  } catch (e) {
    if (e instanceof ValidationError || e instanceof NotFoundError) return { error: e.message };
    throw e;
  }
  revalidatePath("/me/friends");
  return {};
}

/** The customer said yes to the invite banner. Server actions are POST-only with an origin check. */
export async function acceptInviteAction(): Promise<{ error?: string }> {
  const me = await viewer();
  const jar = await cookies();
  const ref = jar.get(REF_COOKIE)?.value ?? "";
  jar.delete(REF_COOKIE);
  if (REF_RE.test(ref)) await friendsService.acceptInvite(me, ref);
  revalidatePath("/me", "layout");
  return {};
}

export async function dismissInviteAction(): Promise<void> {
  (await cookies()).delete(REF_COOKIE);
  revalidatePath("/me", "layout");
}

import { getDb } from "../../db/client";
import type { Env } from "../../env";
import { unassignedCounts } from "../inquiries/repository";
import { getSession, type SessionUser } from "./session";

export { safeRedirect } from "./redirect";

export type Shell = { user: SessionUser; unassigned: { total: number; overdue: number } };

export async function loadShell(env: Env, headers: Headers): Promise<Shell | null> {
  const user = await getSession(env, headers);
  if (!user) return null;
  return { user, unassigned: await unassignedCounts(getDb(env)) };
}

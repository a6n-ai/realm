"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { session as sessionTable } from "@/db/schema";
import { getMemberOrganizations } from "@/lib/services/organizations.service";
import { auth } from "./index";
import { getSession } from "./session";

// Does not call Better Auth's auth.api.setActiveOrganization: that endpoint
// requires a DIRECT member row on the target org, but a brand admin here may
// act as any franchise under the brand without one (getMemberOrganizations
// cascades brand membership to its franchises). So this re-implements the
// authorization with that cascade and writes the session's active-org column
// directly. Not a schema limitation — the adapter does register
// member/organization now.
export async function switchActiveOrganization(organizationId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No active session.");
  const allowed = await getMemberOrganizations(session);
  if (!allowed.some((o) => o.id === organizationId)) {
    throw new Error("Not authorized for this organization.");
  }

  const raw = await auth.api.getSession({ headers: await headers() });
  if (!raw?.session?.id) throw new Error("No active session.");
  await db.update(sessionTable).set({ activeOrganizationId: organizationId }).where(eq(sessionTable.id, raw.session.id));
}

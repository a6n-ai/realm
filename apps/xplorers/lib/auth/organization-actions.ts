"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { session as sessionTable } from "@/db/schema";
import { getMemberOrganizations } from "@/lib/services/organizations.service";
import { auth } from "./index";
import { getSession } from "./session";

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

"use server";

import { headers } from "next/headers";
import { auth } from "./index";

// Switches the staff session's active org (which member row scopes what they
// see, including which location's Clover config resolves) via Better Auth's
// own org-plugin endpoint — the same mechanism resolveActingOrg already
// keys off, not a bespoke cookie.
export async function switchActiveOrganization(organizationId: string): Promise<void> {
  await auth.api.setActiveOrganization({ headers: await headers(), body: { organizationId } });
}

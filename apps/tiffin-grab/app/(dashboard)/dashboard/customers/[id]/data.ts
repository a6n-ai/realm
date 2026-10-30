import { cache } from "react";
import { notFound } from "next/navigation";
import { NotFoundError } from "@foundry/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getCustomer360 } from "@/lib/services/customers.service";
import { getAppSettings } from "@/lib/services/app-settings.service";

// The layout (header + stats) and the open tab both read the customer; cache() makes that one query per request.
export const loadCustomer = cache(async (id: string) => {
  await requireStaff();
  try {
    return await getCustomer360(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
});

export const loadViewer = cache(async () => {
  const [session, { timezone }] = await Promise.all([getSession(), getAppSettings()]);
  // Email is the login identity and coins are money: only admins edit those.
  return { session, isAdmin: session?.user?.role === "admin", timezone };
});

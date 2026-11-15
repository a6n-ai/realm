import { cache } from "react";
import { notFound } from "next/navigation";
import { NotFoundError } from "@foundry/commons";
import { can, requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getCustomer360 } from "@/lib/services/customers.service";
import { getAppSettings } from "@/lib/settings";

// The layout (header + stats) and the open tab both read the customer; cache() makes that one query per request.
export const loadCustomer = cache(async (id: string) => {
  await requirePermission({ customer: ["read"] });
  try {
    return await getCustomer360(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
});

export const loadViewer = cache(async () => {
  const [session, { timezone }, canEdit, canWallet, canGive] = await Promise.all([
    getSession(),
    getAppSettings(),
    can({ customer: ["manage"] }),
    can({ wallet: ["read"] }),
    can({ wallet: ["give"] }),
  ]);
  // Email is the login identity and coins are money: gated by customer:manage and the wallet verbs.
  return { session, canEdit, canWallet, canGive, timezone };
});

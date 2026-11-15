import { cache } from "react";
import { notFound } from "next/navigation";
import { NotFoundError } from "@foundry/commons";
import { can, requirePagePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { listCustomerOrderActivities } from "@/lib/orders/orders.service";
import {
  addressTimeline,
  getCustomerInquiries,
  getCustomerOrders,
  getCustomerPayments,
  getCustomerProfile,
  getCustomerSpend,
  planAddressTimeline,
  walletTimeline,
} from "@/lib/services/customers.service";
import { getAppSettings } from "@/lib/settings";

// Each section loader checks its own permission first, so a denied viewer never reaches its query.
// Callers also gate the section; the check here is the backstop.

// The header and the open tab both read the profile; cache() makes that one query per request.
export const loadCustomer = cache(async (id: string) => {
  await requirePagePermission({ customer: ["read"] });
  try {
    return { profile: await getCustomerProfile(id) };
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
});

const customerId = async (id: string) => (await loadCustomer(id)).profile.id;

export const loadCustomerOrders = cache(async (id: string) => {
  await requirePagePermission({ order: ["read"] });
  return getCustomerOrders(await customerId(id), { withPayments: await can({ finance: ["read"] }) });
});

export const loadCustomerPayments = cache(async (id: string) => {
  await requirePagePermission({ finance: ["read"] });
  return getCustomerPayments(await customerId(id));
});

export const loadCustomerSpend = cache(async (id: string) => {
  await requirePagePermission({ finance: ["read"] });
  return getCustomerSpend(await customerId(id));
});

export const loadCustomerInquiries = cache(async (id: string) => {
  await requirePagePermission({ inquiry: ["read"] });
  return getCustomerInquiries(await customerId(id));
});

export const loadCustomerWalletEvents = cache(async (id: string) => {
  await requirePagePermission({ wallet: ["read"] });
  return walletTimeline(await customerId(id));
});

export const loadCustomerAddressEvents = cache(async (id: string) => addressTimeline(await customerId(id)));

export const loadCustomerPlanAddressEvents = cache(async (id: string) => {
  await requirePagePermission({ order: ["read"] });
  return planAddressTimeline(await customerId(id), await loadCustomerOrders(id));
});

export const loadCustomerOrderActivity = cache(async (id: string) => {
  await requirePagePermission({ order: ["read"] });
  return listCustomerOrderActivities(await customerId(id));
});

export const loadViewer = cache(async () => {
  const [session, { timezone }, canEdit, canWallet, canGive, canOrder, canFinance] = await Promise.all([
    getSession(),
    getAppSettings(),
    can({ customer: ["manage"] }),
    can({ wallet: ["read"] }),
    can({ wallet: ["give"] }),
    can({ order: ["read"] }),
    can({ finance: ["read"] }),
  ]);
  // Email is the login identity and coins are money: gated by customer:manage and the wallet verbs.
  return { session, canEdit, canWallet, canGive, canOrder, canFinance, timezone };
});

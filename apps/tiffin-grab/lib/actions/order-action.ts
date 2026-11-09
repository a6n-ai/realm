import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { revalidateOrder } from "@/lib/revalidate";
import { assertDeliveryVisible, assertOrderVisible, assertPaymentVisible } from "@/lib/services/orders.service";
import { runAction, type ActionResult } from "./action-result";

type Ids = { order?: string; delivery?: string; payment?: string };
/** At least one id: an action that names no order, delivery or payment cannot be checked, so it cannot compile. */
export type OrderTarget = { [K in keyof Ids]-?: Required<Pick<Ids, K>> & Ids }[keyof Ids];

/** Staff (or admin) session, then every named order, delivery or payment must sit in the caller's organizations. */
export async function assertOrderAccess(target: OrderTarget, role: "staff" | "admin" = "staff"): Promise<void> {
  await (role === "admin" ? requireAdmin() : requireStaff());
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  if (target.order) await assertOrderVisible(target.order, visible);
  if (target.delivery) await assertDeliveryVisible(target.delivery, visible);
  if (target.payment) await assertPaymentVisible(target.payment, visible);
}

type Opts = OrderTarget & { role?: "staff" | "admin"; orderPage?: string; reach?: Parameters<typeof revalidateOrder>[1] };

/**
 * An order-page staff action: guard + visibility, `runAction`, then revalidate the order page on success.
 * `orderPage` is the order whose page to refresh (it may differ from the checked ids); omit it to skip.
 */
export async function orderAction<T extends Record<string, unknown>>(
  opts: Opts,
  fn: () => Promise<T>,
): Promise<ActionResult<T>>;
export async function orderAction(
  opts: Opts,
  fn: () => Promise<void | string>,
): Promise<ActionResult>;
export async function orderAction(
  opts: Opts,
  fn: () => Promise<void | string | Record<string, unknown>>,
): Promise<ActionResult<Record<string, unknown>>> {
  const { role, orderPage, reach, ...target } = opts;
  const res = await runAction(async () => {
    await assertOrderAccess(target as OrderTarget, role);
    return fn() as Promise<Record<string, unknown>>;
  });
  if ("ok" in res && orderPage) revalidateOrder(orderPage, reach);
  return res;
}

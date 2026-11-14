import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { revalidateOrder } from "@/lib/revalidate";
import { assertDeliveryVisible, assertOrderVisible, assertPaymentVisible } from "@/lib/orders/orders.service";
import { runAction, type ActionResult } from "@/lib/actions/action-result";
import { guard as runGuard, revalidateAll, type Guard, type RevalidateTarget } from "@/lib/actions/staff-action";

type Ids = { order?: string; delivery?: string; payment?: string };
/** At least one id: an action that names no order, delivery or payment cannot be checked, so it cannot compile. */
export type OrderTarget = { [K in keyof Ids]-?: Required<Pick<Ids, K>> & Ids }[keyof Ids];

/** The guard (staff by default), then every named order, delivery or payment must sit in the caller's organizations. */
export async function assertOrderAccess(target: OrderTarget, guard: Guard = "staff"): Promise<void> {
  await runGuard(guard);
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  if (target.order) await assertOrderVisible(target.order, visible);
  if (target.delivery) await assertDeliveryVisible(target.delivery, visible);
  if (target.payment) await assertPaymentVisible(target.payment, visible);
}

type Opts = OrderTarget & {
  guard?: Guard;
  orderPage?: string;
  reach?: Parameters<typeof revalidateOrder>[1];
  revalidate?: readonly RevalidateTarget[];
};

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
  const { guard, orderPage, reach, revalidate, ...target } = opts;
  const res = await runAction(async () => {
    await assertOrderAccess(target as OrderTarget, guard);
    return fn() as Promise<Record<string, unknown>>;
  });
  if ("ok" in res) {
    if (orderPage) revalidateOrder(orderPage, reach);
    revalidateAll(revalidate);
  }
  return res;
}

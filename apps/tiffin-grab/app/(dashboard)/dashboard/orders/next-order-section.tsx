import { eq } from "@foundry/commons/model/condition";
import { zonedDateIso } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { requirePagePermission } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/settings";
import { loadOwnerOptions } from "@/lib/list/facet-options";
import { ALL_OWNERS, ME, resolveOwnerParam } from "@/lib/list/presets";
import { requestNow } from "@/lib/dates/request-now";
import { nextOrder, orderQueueCount, upNextOrders, type OrderQueueScope } from "@/lib/orders/next-order.service";
import type { OwnerChoice } from "@/components/dashboard/next-item/next-item-parts";
import { RECOMMENDATION_LIMIT } from "@/components/dashboard/next-item/recommendation-grid";
import { NextOrderCard } from "./next-order-card";


type SearchParams = Record<string, string | undefined>;

/** The card's own owner param is set on top of the list's, so the list keeps its filters. */
function hrefWith(sp: SearchParams, changes: Record<string, string | null>): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && !(k in changes)) next.set(k, v);
  for (const [k, v] of Object.entries(changes)) if (v != null) next.set(k, v);
  const qs = next.toString();
  return qs ? `/dashboard/orders?${qs}` : "/dashboard/orders";
}

/** The Next order grid: the order to act on for the owner, then the ones after it. */
export async function NextOrderSection({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission({ order: ["read"] });
  const sp = await searchParams;
  const session = await getSession();
  const viewer = session?.user.id;
  const { timezone, currency } = await getAppSettings();
  const now = requestNow();
  const today = zonedDateIso(now, timezone);
  const orderOwner = typeof sp.orderOwner === "string" ? sp.orderOwner : ME;
  const owner = resolveOwnerParam(orderOwner, viewer);
  const scope: OrderQueueScope = {
    visible: await resolveSessionVisibleOrgIds(session),
    condition: owner ? eq("owner", owner) : undefined,
  };
  const [owners, count] = await Promise.all([loadOwnerOptions(), orderQueueCount(scope, today)]);
  const row = await nextOrder(scope, today);
  const upNext = row ? await upNextOrders(scope, today, row.publicId, RECOMMENDATION_LIMIT - 1) : [];
  const ownerOptions: OwnerChoice[] = [{ value: ME, label: "Me" }, { value: ALL_OWNERS, label: "All owners" }, ...owners].map((o) => ({
    ...o,
    href: hrefWith(sp, { orderOwner: o.value }),
  }));
  return (
    <NextOrderCard
      row={row}
      currency={currency}
      now={now}
      queueCount={count}
      owner={{ current: orderOwner, options: ownerOptions }}
      upNext={upNext}
      attentionHref={hrefWith(sp, { view: "payment", orderOwner: null })}
    />
  );
}

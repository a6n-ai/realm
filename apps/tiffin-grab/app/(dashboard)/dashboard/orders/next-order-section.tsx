import { eq } from "@foundry/commons/model/condition";
import { zonedDateIso } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { loadOwnerOptions } from "@/lib/list/facet-options";
import { ALL_OWNERS, ME, resolveOwnerParam } from "@/lib/list/presets";
import { requestNow } from "@/lib/dates/request-now";
import { nextOrder, orderQueueCount, queueOrder, upNextOrders, type OrderQueueScope } from "@/lib/services/next-order.service";
import type { OwnerChoice } from "@/components/dashboard/next-item/next-item-card";
import { NextOrderCard } from "./next-order-card";

const UP_NEXT_COUNT = 6;

type SearchParams = Record<string, string | undefined>;

/** The card's own params (`order`, `orderOwner`) are set on top of the list's, so the list keeps its filters. */
function hrefWith(sp: SearchParams, changes: Record<string, string | null>): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && !(k in changes)) next.set(k, v);
  for (const [k, v] of Object.entries(changes)) if (v != null) next.set(k, v);
  const qs = next.toString();
  return qs ? `/dashboard/orders?${qs}` : "/dashboard/orders";
}

/** The Next order card: the order to act on for the card's owner, with Previous/Next and the up-next strip. */
export async function NextOrderSection({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff();
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
  const chosenId = typeof sp.order === "string" ? sp.order : undefined;
  const row = (chosenId ? await queueOrder(scope, today, chosenId) : null) ?? (await nextOrder(scope, today));
  const [prev, next, upNext] = row
    ? await Promise.all([
        nextOrder(scope, today, { publicId: row.publicId, dir: "prev" }),
        nextOrder(scope, today, { publicId: row.publicId, dir: "next" }),
        upNextOrders(scope, today, row.publicId, UP_NEXT_COUNT),
      ])
    : [null, null, []];
  const ownerOptions: OwnerChoice[] = [{ value: ME, label: "Me" }, { value: ALL_OWNERS, label: "All owners" }, ...owners].map((o) => ({
    ...o,
    href: hrefWith(sp, { orderOwner: o.value, order: null }),
  }));
  return (
    <NextOrderCard
      row={row}
      currency={currency}
      now={now}
      queueCount={count}
      owner={{ current: orderOwner, options: ownerOptions }}
      prevHref={prev ? hrefWith(sp, { order: prev.publicId }) : undefined}
      nextHref={next ? hrefWith(sp, { order: next.publicId }) : undefined}
      upNext={upNext.map((r) => ({ ...r, href: hrefWith(sp, { order: r.publicId }) }))}
      attentionHref={hrefWith(sp, { view: "payment", order: null, orderOwner: null })}
    />
  );
}

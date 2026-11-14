import Link from "next/link";
import { zonedDateIso } from "@foundry/commons";
import { Badge } from "@/components/reui/badge";
import { humanDate } from "@/lib/deliveries/view";
import { getAppSettings } from "@/lib/settings";
import { getOptimoRouteStatus } from "@/lib/optimoroute/config";
import { nextRoutePushStatus } from "@/lib/optimoroute/push-status";
import { requestNow } from "@/lib/dates/request-now";

/** Top-bar note: has the next delivery day gone to OptimoRoute? Links to Dispatch. */
export async function RoutePushBadge() {
  const [{ installed }, { timezone }] = await Promise.all([getOptimoRouteStatus(), getAppSettings()]);
  if (!installed) return null;
  const status = await nextRoutePushStatus(zonedDateIso(requestNow(), timezone));
  if (!status) return null;

  const { date, total, pushed } = status;
  const [variant, text] =
    pushed === 0 ? (["warning-light", "not pushed"] as const)
    : pushed < total ? (["warning-light", `pushed ${pushed}/${total}`] as const)
    : (["success-light", "pushed"] as const);

  return (
    <Link href="/dashboard/dispatch" prefetch={false} title={`${pushed} of ${total} stops for ${humanDate(date)} are on OptimoRoute`} className="hidden sm:inline-flex">
      <Badge variant={variant}>OptimoRoute · {humanDate(date)} {text}</Badge>
    </Link>
  );
}

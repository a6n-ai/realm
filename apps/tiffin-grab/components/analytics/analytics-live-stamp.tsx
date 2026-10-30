/* eslint-disable react-hooks/purity */
import { clockInZone } from "@/lib/analytics/profitability";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { LiveRefresh } from "@/components/analytics/live-refresh";

/** Live clock in the business timezone, same pill Profitability shows beside its month nav. */
export async function AnalyticsLiveStamp({ refreshAt }: { refreshAt?: number | null }) {
  const { timezone } = await getAppSettings();
  return <LiveRefresh updatedLabel={clockInZone(Date.now(), timezone)} refreshAt={refreshAt} />;
}

import { ManualRefresh } from "@/components/analytics/manual-refresh";

/** Server slot that used to stream a live clock; now just the manual Refresh control. */
export async function AnalyticsLiveStamp(_props: { refreshAt?: number | null }) {
  return <ManualRefresh />;
}

import Link from "next/link";
import { ChartCard } from "@/components/analytics/chart-card";
import { PartsDonut } from "@/components/analytics/charts";
import { DELIVERY_TONE } from "@/components/analytics/status-tones";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { listDayDeliveryStatuses } from "@/lib/services/daily-labels.service";
import { deliveryGroup, GROUP_LABEL } from "./delivery-groups";

const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;

export async function TodayDeliveriesCard({ today }: { today: string }) {
  const [rows, settings] = await Promise.all([listDayDeliveryStatuses(today), getAppSettings()]);
  const counts = new Map<keyof typeof DELIVERY_TONE, number>();
  for (const r of rows) counts.set(deliveryGroup(r), (counts.get(deliveryGroup(r)) ?? 0) + 1);

  return (
    <ChartCard title="Today's deliveries" subtitle={`Order cutoff ${hourLabel(settings.cutoffHour)} the evening before`} fill>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No deliveries today.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <PartsDonut
            caption="Stops"
            max={4}
            parts={[...counts].map(([key, value]) => ({ label: GROUP_LABEL[key], value, tone: DELIVERY_TONE[key] }))}
          />
          <Link href="/dashboard/dispatch" className="text-sm underline underline-offset-2">
            Open Dispatch
          </Link>
        </div>
      )}
    </ChartCard>
  );
}

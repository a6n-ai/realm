import { TruckIcon } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { zonedDateIso } from "@foundry/commons";
import { PageShell, PageHeader } from "@/components/ds";
import { DayHeader } from "../day-header";
import { DispatchTabs } from "../dispatch-tabs";
import { CompletionsView } from "../completions-view";

type SearchParams = Promise<{ date?: string }>;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CompletionsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const { date: dateParam } = await searchParams;
  const { timezone } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const today = zonedDateIso(Date.now(), timezone);
  const date = dateParam && ISO_DATE.test(dateParam) ? dateParam : today;

  return (
    <PageShell>
      <PageHeader icon={TruckIcon} title="Dispatch" subtitle="Today's routes and driver assignments." />
      <DayHeader date={date} today={today} basePath="/dashboard/dispatch/completions" />
      <DispatchTabs date={date} />
      <CompletionsView date={date} />
    </PageShell>
  );
}

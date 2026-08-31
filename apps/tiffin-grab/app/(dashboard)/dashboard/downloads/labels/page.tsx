import { zonedDateIso } from "@foundry/commons";
import { TagIcon } from "lucide-react";
import { PageHeader } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getPackingLabels } from "@/lib/services/labels.service";
import { LabelsDatePicker } from "./labels-date-picker";
import { LabelsExportButton } from "./labels-export-button";
import { LabelsTable } from "./labels-table";

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireAdmin();
  const { date } = await searchParams;
  const { timezone } = await getAppSettings();
  const dateIso = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : zonedDateIso(Date.now(), timezone);

  const rows = await getPackingLabels(dateIso);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={TagIcon}
        title="Labels"
        subtitle="Per-day packing manifest for Tiffin-plan deliveries — pick a date, then export to Excel."
      />
      <div className="flex flex-wrap items-center gap-3">
        <LabelsDatePicker value={dateIso} />
        <LabelsExportButton rows={rows} dateIso={dateIso} />
      </div>
      <LabelsTable rows={rows} />
    </div>
  );
}

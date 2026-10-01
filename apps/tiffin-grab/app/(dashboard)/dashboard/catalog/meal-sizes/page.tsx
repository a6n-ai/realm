import { Suspense } from "react";
import { UtensilsIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { getTrialSettings } from "@/lib/services/trial-settings.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { orderDeliveryDays, type DayOfWeek } from "@/lib/menu/delivery-days";
import { CatalogData, type SearchParams } from "../[resource]/page";
import { ResourceEditorSkeleton } from "../[resource]/resource-editor";
import { GroupedResourceTabs } from "../grouped-resource-tabs";
import { TrialSettingsForm, TrialSettingsSkeleton } from "./trial-settings-form";

async function TrialSettingsData() {
  await requireAdmin();
  const orgId = await resolveRequestOrg();
  const [settings, catalog] = await Promise.all([getTrialSettings(orgId), loadCatalogSnapshot(orgId)]);
  const frequencies = catalog.frequencies.map((f) => ({
    key: f.key,
    name: f.name,
    weekdays: orderDeliveryDays({ frequencyKey: f.key, weekdays: f.weekdays as DayOfWeek[] | null, includeSaturday: false, includeSunday: false }),
  }));
  return <TrialSettingsForm value={settings} frequencies={frequencies} />;
}

// Static route shadows catalog/[resource] for meal-sizes, same as delivery settings.
export default function MealSizesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader icon={UtensilsIcon} title="Meal sizes" />
      <SectionCard title="Entries">
        <GroupedResourceTabs
          tabs={[
            {
              value: "sizes",
              label: "Sizes",
              content: (
                <Suspense fallback={<ResourceEditorSkeleton resource="meal-sizes" />}>
                  <CatalogData resource="meal-sizes" searchParams={searchParams} />
                </Suspense>
              ),
            },
            {
              value: "trial",
              label: "Trial",
              content: (
                <Suspense fallback={<TrialSettingsSkeleton />}>
                  <TrialSettingsData />
                </Suspense>
              ),
            },
          ]}
        />
      </SectionCard>
    </PageShell>
  );
}

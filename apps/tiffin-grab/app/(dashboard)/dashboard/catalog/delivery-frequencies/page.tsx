import { Suspense } from "react";
import { TruckIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { CatalogData, type SearchParams } from "../[resource]/page";
import { ResourceEditorSkeleton } from "../[resource]/resource-editor";
import { GroupedResourceTabs } from "../grouped-resource-tabs";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { TiffinsPerWeekForm, TiffinsPerWeekSkeleton } from "./tiffins-per-week-form";

async function TiffinsPerWeekData() {
  await requireAdmin();
  const s = await getAppSettings();
  return <TiffinsPerWeekForm min={s.minTiffinsPerWeek} max={s.maxTiffinsPerWeek} />;
}

async function DeliveryChargesData() {
  await requireAdmin();
  const { deliveryService } = await import("@/lib/services/delivery.service");
  const { resolveRequestOrg } = await import("@/lib/tenant/resolve-request-org");
  const { DeliveryChargesManager } = await import("@foundry/delivery/ui");
  const { deliveryChargesActions } = await import("../../delivery/charges/admin-actions");
  const orgId = await resolveRequestOrg();
  const [baseCharge, deliveryStrategies, addressTags] = await Promise.all([
    deliveryService.getBaseDeliveryCharge(orgId),
    deliveryService.listDeliveryStrategies({ includeInactive: true, orgId }),
    deliveryService.listAddressTags({ includeInactive: true, orgId }),
  ]);
  return (
    <DeliveryChargesManager
      initialBaseCharge={baseCharge}
      initialDeliveryStrategies={deliveryStrategies}
      initialAddressTags={addressTags}
      actions={deliveryChargesActions}
    />
  );
}

async function DeliveryZonesData() {
  await requireAdmin();
  const { deliveryService } = await import("@/lib/services/delivery.service");
  const { resolveRequestOrg } = await import("@/lib/tenant/resolve-request-org");
  const { DeliveryAdminProvider, DeliveryZonesManager } = await import("@foundry/delivery/ui");
  const { deliveryAdminActions } = await import("../../delivery/charges/admin-actions");
  const orgId = await resolveRequestOrg();
  const [zones, types, origin] = await Promise.all([
    deliveryService.listZones({ includeInactive: true, orgId }),
    deliveryService.listTypes({ includeInactive: true, orgId }),
    deliveryService.getStoreOrigin(orgId),
  ]);
  return (
    <DeliveryAdminProvider actions={deliveryAdminActions}>
      <DeliveryZonesManager
        mapStyleUrl={process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? null}
        origin={origin}
        zones={zones.map((z) => ({
          publicId: z.publicId!,
          name: z.name,
          radiusKm: z.radiusKm,
          postalPrefixes: z.postalPrefixes,
          slotWindow: z.slotWindow,
          active: z.active,
          typePublicIds: z.types.map((t) => t.publicId!),
        }))}
        types={types.map((t) => ({ publicId: t.publicId!, key: t.key, label: t.label, active: t.active }))}
      />
    </DeliveryAdminProvider>
  );
}

async function DeliveryTypesData() {
  await requireAdmin();
  const { deliveryService } = await import("@/lib/services/delivery.service");
  const { resolveRequestOrg } = await import("@/lib/tenant/resolve-request-org");
  const { DeliveryAdminProvider, DeliveryTypesManager } = await import("@foundry/delivery/ui");
  const { deliveryAdminActions } = await import("../../delivery/charges/admin-actions");
  const types = await deliveryService.listTypes({ includeInactive: true, orgId: await resolveRequestOrg() });
  return (
    <DeliveryAdminProvider actions={deliveryAdminActions}>
      <DeliveryTypesManager
        types={types.map((t) => ({
          publicId: t.publicId!,
          key: t.key,
          label: t.label,
          description: t.description ?? null,
          requiresAddress: t.requiresAddress,
          requiresSchedule: t.requiresSchedule,
          minSubtotal: t.minSubtotal,
          discountPct: t.discountPct,
          sortOrder: t.sortOrder,
          active: t.active,
        }))}
      />
    </DeliveryAdminProvider>
  );
}

// Combines "delivery-frequencies", "duration-packages" and "delivery-zones"
// into one tabbed "Delivery settings" card — same pattern as dishes/page.tsx
// and addons/page.tsx; each stays a distinct RESOURCES entry, only the page
// shell groups them. This static route shadows the dynamic [resource] route
// for the "delivery-frequencies" key, exactly as dishes/page.tsx does for "dishes".
export default function DeliverySettingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader icon={TruckIcon} title="Delivery settings" />
      <SectionCard title="Entries">
        <GroupedResourceTabs
          tabs={[
            {
              value: "delivery-frequencies",
              label: "Frequencies",
              content: (
                <Suspense fallback={<ResourceEditorSkeleton resource="delivery-frequencies" />}>
                  <CatalogData resource="delivery-frequencies" searchParams={searchParams} />
                </Suspense>
              ),
            },
            {
              value: "duration-packages",
              label: "Duration packages",
              content: (
                <Suspense fallback={<ResourceEditorSkeleton resource="duration-packages" />}>
                  <CatalogData resource="duration-packages" searchParams={searchParams} />
                </Suspense>
              ),
            },
            {
              value: "delivery-zones",
              label: "Zones",
              content: (
                <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" />}>
                  <DeliveryZonesData />
                </Suspense>
              ),
            },
            {
              value: "delivery-types",
              label: "Delivery types",
              content: (
                <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" />}>
                  <DeliveryTypesData />
                </Suspense>
              ),
            },
            {
              value: "tiffins-per-week",
              label: "Tiffins per week",
              content: (
                <Suspense fallback={<TiffinsPerWeekSkeleton />}>
                  <TiffinsPerWeekData />
                </Suspense>
              ),
            },
            {
              value: "delivery-charges",
              label: "Delivery charges",
              content: (
                <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" />}>
                  <DeliveryChargesData />
                </Suspense>
              ),
            },
          ]}
        />
      </SectionCard>
    </PageShell>
  );
}

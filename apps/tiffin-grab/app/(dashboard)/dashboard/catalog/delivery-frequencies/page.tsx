import { Suspense } from "react";
import { TruckIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { CatalogData, type SearchParams } from "../catalog-data";
import { ResourceEditorSkeleton } from "../[resource]/resource-editor";
import { GroupedResourceTabs } from "../grouped-resource-tabs";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/settings";
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
  const { DeliveryChargesBoundary } = await import("../../delivery/charges/delivery-clients");
  const orgId = await resolveRequestOrg();
  const [baseCharge, deliveryStrategies, strategyGroups] = await Promise.all([
    deliveryService.getBaseDeliveryCharge(orgId),
    deliveryService.listDeliveryStrategies({ includeInactive: true, orgId }),
    deliveryService.listDeliveryStrategyGroups({ includeInactive: true, orgId }),
  ]);
  return (
    <DeliveryChargesBoundary
      initialBaseCharge={baseCharge}
      initialDeliveryStrategies={deliveryStrategies}
      initialStrategyGroups={strategyGroups}
    />
  );
}

async function DeliveryZonesData() {
  await requireAdmin();
  const { deliveryService } = await import("@/lib/services/delivery.service");
  const { resolveRequestOrg } = await import("@/lib/tenant/resolve-request-org");
  const { DeliveryZonesManager } = await import("@foundry/delivery/ui");
  const { DeliveryAdminBoundary } = await import("../../delivery/charges/delivery-clients");
  const orgId = await resolveRequestOrg();
  const [zones, types, origin] = await Promise.all([
    deliveryService.listZones({ includeInactive: true, orgId }),
    deliveryService.listTypes({ includeInactive: true, orgId }),
    deliveryService.getStoreOrigin(orgId),
  ]);
  return (
    <DeliveryAdminBoundary>
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
    </DeliveryAdminBoundary>
  );
}

async function DeliveryTypesData() {
  await requireAdmin();
  const { deliveryService } = await import("@/lib/services/delivery.service");
  const { resolveRequestOrg } = await import("@/lib/tenant/resolve-request-org");
  const { DeliveryTypesManager } = await import("@foundry/delivery/ui");
  const { DeliveryAdminBoundary } = await import("../../delivery/charges/delivery-clients");
  const types = await deliveryService.listTypes({ includeInactive: true, orgId: await resolveRequestOrg() });
  return (
    <DeliveryAdminBoundary>
      {/* Discounts live in the central Discounts page, not on the type. */}
      <DeliveryTypesManager
        showDiscount={false}
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
    </DeliveryAdminBoundary>
  );
}

// Combines "delivery-frequencies", "duration-packages", the @foundry/delivery zone/type/charge managers
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

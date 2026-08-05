import { Suspense } from "react";
import { PercentIcon } from "lucide-react";
import { getCloverConnection } from "@realm/clover";
import { formatMoney } from "@realm/commons";
import { PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@realm/ui/table";
import { redirect } from "next/navigation";
import { CloverCatalogSyncActions } from "@/components/admin/clover-catalog-sync-actions";
import { requireAdmin } from "@/lib/auth/guards";
import { DiscountOfferControls } from "./discount-offer-row";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { inventoryCatalogService } from "@/lib/services/inventory.service";

export const dynamic = "force-dynamic";

export default function CloverDiscountsPage() {
  return (
    <PageShell>
      <PageHeader
        icon={PercentIcon}
        title="Discounts"
        subtitle="Clover inventory discounts. Toggle one to offer it at checkout, or give it a coupon code."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <SectionCard title="All discounts">
        <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
          <DiscountsTable />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function HeaderActions() {
  await requireAdmin();
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");
  return (
    <CloverCatalogSyncActions
      cloverConnected={Boolean(clover.connected && clover.merchantId)}
    />
  );
}

function discountLabel(row: {
  amount: string | null;
  percentage: string | null;
}): string {
  if (row.percentage != null && row.percentage !== "") {
    return `${Number(row.percentage)}%`;
  }
  if (row.amount != null && row.amount !== "") {
    return formatMoney(Number(row.amount));
  }
  return "—";
}

async function DiscountsTable() {
  await requireAdmin();
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");

  const rows = await inventoryCatalogService.discounts.listAll();

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No discounts yet. Sync from Clover to pull them.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Value</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Offer at checkout / code</TableHead>
          <TableHead>Clover id</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.publicId}>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>{discountLabel(r)}</TableCell>
            <TableCell>
              <Badge variant={r.active ? "default" : "outline"}>
                {r.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>
              <DiscountOfferControls
                publicId={r.publicId}
                publicOffer={r.publicOffer}
                couponCode={r.couponCode}
              />
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">
              {r.cloverDiscountId ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

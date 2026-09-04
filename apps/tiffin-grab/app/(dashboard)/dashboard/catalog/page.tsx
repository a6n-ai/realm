import Link from "next/link";
import { ArrowLeftRightIcon, ArrowRightIcon, LayersIcon, UtensilsCrossedIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, PageHeader, PageShell } from "@/components/ds";
import { catalogIndexEntries } from "./resource-config";

export default async function CatalogIndexPage() {
  await requireAdmin();
  return (
    <PageShell>
      <PageHeader icon={UtensilsCrossedIcon} title="Catalog" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalogIndexEntries().map((r) => (
          <Link key={r.key} href={`/dashboard/catalog/${r.key}`} className="group" prefetch={false}>
            <Card variant="lift" className="h-full">
              <CardHeader className="flex flex-row items-start justify-between">
                <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
                  <LayersIcon className="size-5" />
                </span>
                <ArrowRightIcon className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
              </CardHeader>
              <CardContent>
                <div className="font-medium">{r.label}</div>
                <div className="text-muted-foreground text-sm">Edit {r.label.toLowerCase()}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {/* Not a ResourceDef — a swap rule is a grouped-by-meal-size list of directional
            pairs, not a flat single-table CRUD, so this is a hand-authored card + a
            bespoke static route rather than routed through catalogIndexEntries(). */}
        <Link href="/dashboard/catalog/swaps" className="group" prefetch={false}>
          <Card variant="lift" className="h-full">
            <CardHeader className="flex flex-row items-start justify-between">
              <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
                <ArrowLeftRightIcon className="size-5" />
              </span>
              <ArrowRightIcon className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
            </CardHeader>
            <CardContent>
              <div className="font-medium">Category swaps</div>
              <div className="text-muted-foreground text-sm">Edit category swaps</div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </PageShell>
  );
}

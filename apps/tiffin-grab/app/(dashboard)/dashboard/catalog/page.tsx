import Link from "next/link";
import { ArrowRightIcon, LayersIcon, UtensilsCrossedIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, PageHeader, PageShell } from "@/components/ds";
import { RESOURCES } from "./resource-config";

export default async function CatalogIndexPage() {
  await requireAdmin();
  return (
    <PageShell>
      <PageHeader icon={UtensilsCrossedIcon} title="Catalog" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(RESOURCES).map((r) => (
          <Link key={r.key} href={`/dashboard/catalog/${r.key}`} className="group">
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
      </div>
    </PageShell>
  );
}

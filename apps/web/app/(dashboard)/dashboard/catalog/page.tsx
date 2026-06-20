import Link from "next/link";
import { ArrowRightIcon, LayersIcon, UtensilsCrossedIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader, PageShell } from "@/components/ds";
import { RESOURCES } from "./resource-config";

export default async function CatalogIndexPage() {
  await requireAdmin();
  return (
    <PageShell>
      <PageHeader icon={UtensilsCrossedIcon} title="Catalog" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(RESOURCES).map((r) => (
          <Link
            key={r.key}
            href={`/dashboard/catalog/${r.key}`}
            className="group card-glow hover-lift hover:bg-accent rounded-lg border p-4"
          >
            <div className="flex items-start justify-between">
              <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
                <LayersIcon className="icon-pop size-5" />
              </span>
              <ArrowRightIcon className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="mt-3 font-medium">{r.label}</div>
            <div className="text-muted-foreground text-sm">Edit {r.label.toLowerCase()}</div>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}

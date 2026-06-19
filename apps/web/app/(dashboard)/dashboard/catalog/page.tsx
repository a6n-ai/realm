import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { RESOURCES } from "./resource-config";

export default async function CatalogIndexPage() {
  await requireAdmin();
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Catalog</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(RESOURCES).map((r) => (
          <Link key={r.key} href={`/dashboard/catalog/${r.key}`} className="hover:bg-accent rounded-lg border p-4">
            <div className="font-medium">{r.label}</div>
            <div className="text-muted-foreground text-sm">Edit {r.label.toLowerCase()}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

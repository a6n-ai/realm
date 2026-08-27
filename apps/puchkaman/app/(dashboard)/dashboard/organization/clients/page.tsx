import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { SectionCard } from "@realm/design-system";
import { listOrganizations } from "@/lib/services/organizations.service";
import { CreateFranchiseButton } from "./create-franchise-button";

export default function ClientsPage() {
  return (
    <SectionCard title="Clients">
      <Suspense fallback={<div className="p-6 text-muted-foreground">Loading…</div>}>
        <ClientsData />
      </Suspense>
    </SectionCard>
  );
}

async function ClientsData() {
  await requireAdmin();
  const orgs = await listOrganizations();
  const brands = orgs.filter((o) => !o.parentOrganizationId);
  const franchisesByBrand = new Map<string, typeof orgs>();
  for (const o of orgs) {
    if (!o.parentOrganizationId) continue;
    const list = franchisesByBrand.get(o.parentOrganizationId) ?? [];
    list.push(o);
    franchisesByBrand.set(o.parentOrganizationId, list);
  }

  return (
    <div className="space-y-4">
      {brands.map((brand) => (
        <div key={brand.id} className="rounded-lg border">
          <Link
            href={`/dashboard/organization/clients/${brand.id}`}
            className="flex items-center justify-between p-4 hover:bg-accent"
          >
            <div>
              <div className="font-medium">{brand.name}</div>
              <div className="text-sm text-muted-foreground">{brand.clientCode} · {brand.memberCount} members</div>
            </div>
          </Link>
          <div className="border-t pl-8">
            {(franchisesByBrand.get(brand.id) ?? []).map((f) => (
              <Link
                key={f.id}
                href={`/dashboard/organization/clients/${f.id}`}
                className="flex items-center justify-between border-b p-4 last:border-b-0 hover:bg-accent"
              >
                <div>
                  <div className="font-medium">{f.name}</div>
                  <div className="text-sm text-muted-foreground">{f.clientCode} · {f.memberCount} members</div>
                </div>
              </Link>
            ))}
            <div className="p-4">
              <CreateFranchiseButton brandOrganizationId={brand.id} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

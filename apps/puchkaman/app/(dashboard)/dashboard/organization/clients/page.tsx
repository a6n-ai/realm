import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { SectionCard } from "@realm/design-system";
import { listOrganizations } from "@/lib/services/organizations.service";
import { ClientsTable } from "./clients-table";

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
  return <ClientsTable orgs={orgs} />;
}

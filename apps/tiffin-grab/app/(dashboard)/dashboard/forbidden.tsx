import { LockIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@foundry/ui/button";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";

export default function DashboardForbidden() {
  return (
    <PageShell>
      <PageHeader icon={LockIcon} title="You don't have access to this page" />
      <SectionCard title="No access">
        <p className="text-muted-foreground text-sm">Your role doesn&apos;t include this. Ask an owner or admin of your organization.</p>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link href="/dashboard">Back to dashboard</Link></Button>
        </div>
      </SectionCard>
    </PageShell>
  );
}

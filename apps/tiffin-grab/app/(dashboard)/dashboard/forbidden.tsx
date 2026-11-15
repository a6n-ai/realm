import { LockIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";

export default function DashboardForbidden() {
  return (
    <PageShell>
      <PageHeader icon={LockIcon} title="You don't have access to this page" />
      <SectionCard title="No access">
        <p className="text-muted-foreground text-sm">Your role doesn&apos;t include this. Ask an owner or admin of your organization.</p>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" asChild><a href="/dashboard">Back to dashboard</a></Button>
        </div>
      </SectionCard>
    </PageShell>
  );
}

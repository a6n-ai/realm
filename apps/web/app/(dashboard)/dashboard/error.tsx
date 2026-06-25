"use client";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageShell>
      <PageHeader icon={AlertTriangleIcon} title="Something went wrong" />
      <SectionCard title="Error">
        <p className="text-muted-foreground text-sm">This page failed to load. Try again, or head back to the dashboard.</p>
        {error.digest ? <p className="text-muted-foreground mt-1 text-xs">Ref: {error.digest}</p> : null}
        <div className="mt-3 flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild><a href="/dashboard">Back to dashboard</a></Button>
        </div>
      </SectionCard>
    </PageShell>
  );
}

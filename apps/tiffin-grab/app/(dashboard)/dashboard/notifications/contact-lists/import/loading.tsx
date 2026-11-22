import Link from "next/link";
import { ArrowLeftIcon, UploadIcon } from "lucide-react";
import { PageHeader } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { Card } from "@foundry/ui/card";
import { Skeleton } from "@foundry/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <PageHeader
        icon={UploadIcon}
        title="Import a list"
        subtitle="CSV. Preview and pick which contacts to keep before anything is saved."
        actions={
          <Button variant="outline" render={<Link href="/dashboard/notifications/contact-lists" />}>
            <ArrowLeftIcon />
            Back to contact lists
          </Button>
        }
      />
      <Card className="p-4">
        <Skeleton className="h-40 w-full" />
      </Card>
    </div>
  );
}

"use client";

import { CircleAlertIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { EmptyState, SectionCard } from "@/components/ds";

export default function OrganizationError({ reset }: { error: Error; reset: () => void }) {
  return (
    <SectionCard title="Couldn't load this section">
      <EmptyState
        icon={CircleAlertIcon}
        message="Something went wrong while loading. Your data is safe; try again."
        action={
          <Button size="sm" variant="outline" onClick={reset}>
            Retry
          </Button>
        }
      />
    </SectionCard>
  );
}

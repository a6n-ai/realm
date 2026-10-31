"use client";

import { AlertCircleIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Alert, AlertDescription } from "@/components/reui/alert";

export default function CustomerGroupsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertDescription className="flex items-center justify-between gap-2">
        <span>{error.message || "Could not load customer groups."}</span>
        <Button size="sm" variant="outline" onClick={reset}>Retry</Button>
      </AlertDescription>
    </Alert>
  );
}

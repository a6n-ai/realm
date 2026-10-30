"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Button } from "@foundry/ui/button";

export default function AnalyticsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Analytics unavailable</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>Something went wrong loading this tab.</p>
        <Button variant="outline" size="sm" onClick={reset}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

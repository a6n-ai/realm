"use client";

import { Button } from "@foundry/ui/button";

export default function SessionsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border p-4">
      <p className="text-sm">Could not load sessions.</p>
      <Button size="sm" variant="outline" onClick={reset}>
        Retry
      </Button>
    </div>
  );
}

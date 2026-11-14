"use client";
import { Button, Card } from "@/components/kit";

export default function DeliveriesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="p-6">
      <p className="text-body font-semibold">Couldn&apos;t load your deliveries.</p>
      <p className="mb-4 mt-1 text-sm text-[var(--muted-foreground)]">Check your connection and try again.</p>
      <Button variant="primary" onClick={reset}>Try again</Button>
    </Card>
  );
}

"use client";
import { Button, Card } from "@/components/customer/kit";

export default function DeliveriesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="p-6">
      <p className="text-[17px] font-semibold">Couldn&apos;t load your deliveries.</p>
      <p className="mb-4 mt-1 text-sm text-[var(--muted-foreground,#6E6558)]">Check your connection and try again.</p>
      <Button variant="primary" onClick={reset}>Try again</Button>
    </Card>
  );
}

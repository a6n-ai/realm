"use client";

import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Button } from "@foundry/ui/button";

/** Inline failure for a Next card; Retry re-renders the server page. */
export function NextItemError({ message }: { message: string }) {
  const router = useRouter();
  return (
    <Alert variant="destructive">
      <AlertTitle>Could not load this queue</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <Button variant="outline" size="sm" className="mt-2 w-fit" onClick={() => router.refresh()}>
        Retry
      </Button>
    </Alert>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function RetryButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => start(() => router.refresh())}>
      {pending ? "Retrying..." : "Retry"}
    </Button>
  );
}

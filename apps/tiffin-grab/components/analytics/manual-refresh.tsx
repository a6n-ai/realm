"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@foundry/ui/button";

/** Analytics pages: staff pulls fresh numbers on demand (no live socket). */
export function ManualRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} aria-hidden />
      {pending ? "Refreshing…" : "Refresh"}
    </Button>
  );
}

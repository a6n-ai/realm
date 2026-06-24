"use client";

import { useRouter } from "next/navigation";
import { LockIcon } from "lucide-react";
import { lockSession } from "@/lib/auth/lock-actions";
import { Button } from "@/components/ui/button";

// Quick manual lock in the header; only rendered when the user has a PIN set.
export function LockButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5"
      onClick={async () => {
        await lockSession();
        router.push("/lock");
      }}
    >
      <LockIcon className="size-4" />
      <span className="hidden sm:inline">Lock</span>
    </Button>
  );
}

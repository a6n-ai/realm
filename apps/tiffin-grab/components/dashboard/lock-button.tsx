"use client";

import { useRouter } from "next/navigation";
import { LockIcon } from "lucide-react";
import { lockSession } from "@/lib/auth/lock-actions";
import { Button } from "@realm/ui/button";

// Quick manual lock in the header. With a PIN set it locks the session; without
// one it sends the user to set a PIN first (locking without a PIN would strand
// them on /lock with no way back except a full sign-in).
export function LockButton({ hasPin }: { hasPin: boolean }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={hasPin ? "Lock session" : "Set up PIN lock"}
      title={hasPin ? "Lock session" : "Set up PIN lock"}
      onClick={async () => {
        if (!hasPin) {
          router.push("/dashboard/account");
          return;
        }
        await lockSession();
        router.push("/lock");
      }}
    >
      <LockIcon className="size-4" />
    </Button>
  );
}

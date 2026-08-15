"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { signOut } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={() =>
        void signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })
      }
    >
      <LogOutIcon data-icon="inline-start" />
      Sign out
    </Button>
  );
}

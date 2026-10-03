"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { signOut } from "@/lib/auth/client";
import { AUTH_BUTTON } from "@/components/auth/auth-kit";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      className={AUTH_BUTTON}
      onClick={() =>
        void signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })
      }
    >
      <LogOutIcon data-icon="inline-start" />
      Sign out
    </Button>
  );
}

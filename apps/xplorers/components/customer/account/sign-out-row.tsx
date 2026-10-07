"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { signOut } from "@/lib/auth/client";

export function SignOutRow() {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full justify-start"
      onClick={() =>
        void signOut({
          fetchOptions: {
            onSuccess: () => router.push("/login"),
          },
        })
      }
    >
      <LogOutIcon data-icon="inline-start" />
      Sign out
    </Button>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={() => signOut({ fetchOptions: { onSuccess: () => { router.push("/login"); router.refresh(); } } })}
    >
      Sign out
    </Button>
  );
}

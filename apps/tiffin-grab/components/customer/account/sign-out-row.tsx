"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";

export function SignOutRow() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        router.push("/login");
      }}
      className={cn(FONT, FOCUS, "flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-semibold text-[var(--muted-foreground)] [touch-action:manipulation] active:bg-[var(--muted)]")}
    >
      <LogOut aria-hidden className="size-[18px]" />
      Sign out
    </button>
  );
}

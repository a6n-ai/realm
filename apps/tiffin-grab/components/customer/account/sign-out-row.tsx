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
      className={cn(FONT, FOCUS, "flex min-h-12 w-full items-center justify-center gap-2 px-4 text-[15px] font-semibold text-[var(--destructive,#C0392B)] transition-colors [touch-action:manipulation] active:bg-[var(--muted)]")}
    >
      <LogOut aria-hidden className="size-[18px]" />
      Sign out
    </button>
  );
}

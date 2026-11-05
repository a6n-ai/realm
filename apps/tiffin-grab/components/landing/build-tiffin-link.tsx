"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useSession } from "@/lib/auth/client";
import { roleLanding } from "@/lib/auth/landing";
import { Role, type RoleValue } from "@foundry/commons";

/** "Build my tiffin": a new order for visitors; a signed-in customer goes to their own home,
 *  where their running plan and renewals live, instead of starting a fresh order. */
export function BuildTiffinLink({ href = "/subscribe", ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href?: string }) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: RoleValue } | undefined)?.role;
  return <Link prefetch={false} {...props} href={session?.user ? roleLanding(role ?? Role.USER) : href} />;
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockIcon, LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { lockSession } from "@/lib/auth/lock-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MenuUser = { email: string; role: string; name: string | null; image: string | null };

export function UserMenu({ user, hasPin }: { user: MenuUser; hasPin: boolean }) {
  const router = useRouter();
  const initials = (user.name?.trim() || user.email).slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="size-8">
          <AvatarImage src={user.image ?? undefined} alt={user.name ?? user.email} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate font-medium">{user.name?.trim() || user.email}</span>
          <span className="text-muted-foreground truncate text-xs font-normal capitalize">{user.role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/account">
              <UserIcon data-icon="inline-start" />
              Account
            </Link>
          </DropdownMenuItem>
          {user.role === "admin" && (
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <SettingsIcon data-icon="inline-start" />
                Settings
              </Link>
            </DropdownMenuItem>
          )}
          {hasPin && (
            <DropdownMenuItem
              onClick={async () => {
                await lockSession();
                router.push("/lock");
              }}
            >
              <LockIcon data-icon="inline-start" />
              Lock session
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })}>
          <LogOutIcon data-icon="inline-start" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

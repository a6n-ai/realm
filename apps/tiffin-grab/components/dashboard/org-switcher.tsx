"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@realm/ui/dropdown-menu";
import { switchActiveOrganization } from "@/lib/auth/organization-actions";
import type { MemberOrganization } from "@/lib/services/organizations.service";

// Header switcher for staff who hold member rows in more than one org — a
// regional manager covering multiple franchises. Hidden entirely below 2 orgs:
// nothing to switch between for the common single-org case.
export function OrgSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: MemberOrganization[];
  activeOrganizationId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (organizations.length < 2) return null;

  const active = organizations.find((o) => o.id === activeOrganizationId) ?? organizations[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 px-2" disabled={pending}>
          <span className="max-w-32 truncate">{active.name}</span>
          <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Switch client</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => {
              if (org.id === active.id) return;
              startTransition(async () => {
                await switchActiveOrganization(org.id);
                router.refresh();
              });
            }}
          >
            <span className="flex-1 truncate">{org.name}</span>
            {org.id === active.id ? <CheckIcon className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

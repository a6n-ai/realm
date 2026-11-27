import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { toast } from "@foundry/ui/toast";
import { Link, useRouter } from "@tanstack/react-router";
import { ChevronsUpDownIcon } from "lucide-react";
import type { Shell } from "../../lib/auth/shell";
import { errorText } from "../../lib/error-copy";
import { setActiveOrganizationFn } from "../../lib/platform/platform.fns";
import { AppMark } from "../auth/auth-kit";

// Vercel's team switcher: the mark and the organisation name; a menu only when there is more than one.
export function OrgSwitcher({ shell }: { shell: Shell }) {
  const router = useRouter();
  const name = shell.organization?.name ?? "a6n";
  const label = (
    <>
      <AppMark className="size-6" />
      <span className="truncate group-data-[collapsible=icon]:hidden">{name}</span>
    </>
  );
  if (shell.organizations.length < 2) {
    return (
      <Link to="/inquiries" className="flex h-9 min-w-0 items-center gap-2 px-2 font-semibold text-(--strong)">
        {label}
      </Link>
    );
  }

  async function choose(id: string) {
    if (id === shell.organization?.id) return;
    const res = await setActiveOrganizationFn({ data: { organizationId: id } });
    if (!res.ok) return void toast.error(errorText(new Error(res.code)));
    await router.navigate({ to: "/inquiries" });
    await router.invalidate();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="h-9 w-full min-w-0 justify-start gap-2 px-2 font-semibold text-(--strong)" aria-label={`Organisation: ${name}`} />}>
        {label}
        <ChevronsUpDownIcon aria-hidden className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>Organisations</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={shell.organization?.id ?? ""} onValueChange={(v) => void choose(String(v))}>
          {shell.organizations.map((o) => (
            <DropdownMenuRadioItem key={o.id} value={o.id}>
              {o.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

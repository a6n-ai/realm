import Link from "next/link";
import { SettingsIcon, TagIcon } from "lucide-react";
import { Button } from "@realm/ui/button";

/** Shown inside a lead sheet when no active lead sources exist — the form
 * cannot be filled without one, so we route the user to add one. */
export function NoSources({ noun }: { noun: "inquiry" | "order" | "customer" }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-2xl">
        <TagIcon className="size-6" />
      </span>
      <div className="grid gap-1">
        <p className="text-foreground font-medium">No lead sources yet</p>
        <p className="text-muted-foreground text-sm text-balance">
          Add at least one source before creating a new {noun}. Sources power lead
          attribution and owner assignment.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard/settings/lead-sources">
          <SettingsIcon className="size-4" />
          Add sources in Settings
        </Link>
      </Button>
    </div>
  );
}

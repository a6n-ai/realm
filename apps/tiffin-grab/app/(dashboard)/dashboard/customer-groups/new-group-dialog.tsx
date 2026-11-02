"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@/components/ds";
import { NewGroupWizard } from "./new/new-group-wizard";

export const WIZARD_DIALOG_CLASS = "sm:max-w-5xl";

export function NewGroupDialog({
  cities,
  maxRows,
}: {
  cities: string[];
  maxRows: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const asked = params.get("new") === "1";

  // `?new=1` (old /new links, the empty-state action) opens the dialog; closing it clears the flag.
  useEffect(() => {
    if (asked) setOpen(true);
  }, [asked]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && asked) {
      const sp = new URLSearchParams(params.toString());
      sp.delete("new");
      router.replace(sp.size ? `${pathname}?${sp}` : pathname);
    }
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon /> New group
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title="New group"
        description="Find customers, review who is included, then save them as a group you can give coins, email or offer a coupon to."
        contentClassName={WIZARD_DIALOG_CLASS}
      >
        {open && (
          <NewGroupWizard
            cities={cities}
            maxRows={maxRows}
            onSaved={({ publicId }) => router.push(`/dashboard/customer-groups/${publicId}`)}
          />
        )}
      </ResponsiveDialog>
    </>
  );
}

"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { ResponsiveDialog } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { NewTicketForm } from "./new-ticket-form";
import type { TicketCategoryValue } from "@/lib/support/ticket-taxonomy";

export function NewTicketControl({
  categories,
  bookings,
  defaultBookingId,
  defaultCategory,
}: {
  categories: readonly TicketCategoryValue[];
  bookings: { value: string; label: string }[];
  defaultBookingId?: string;
  defaultCategory?: TicketCategoryValue;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(searchParams.get("ticket") === "new");

  const openSheet = useCallback(() => {
    setOpen(true);
    router.replace(`${pathname}?ticket=new`, { scroll: false });
  }, [router, pathname]);

  const closeSheet = useCallback(() => {
    setOpen(false);
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  return (
    <>
      <Button size="sm" onClick={openSheet}>
        <PlusIcon data-icon="inline-start" />
        New ticket
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={(v) => (v ? openSheet() : closeSheet())}
        title="New ticket"
        direction="bottom"
      >
        <NewTicketForm
          categories={categories}
          bookings={bookings}
          defaultBookingId={defaultBookingId}
          defaultCategory={defaultCategory}
          onCancel={closeSheet}
        />
      </ResponsiveDialog>
    </>
  );
}

"use client";

import { PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Sheet } from "@/components/customer/kit";
import { NewTicketForm, type TicketCategoryValue } from "./new-ticket-form";

/**
 * Header "New ticket" trigger + the sheet it opens — one control, so the page
 * never needs a second entry point (an empty-state CTA duplicating this one).
 * `?ticket=new` mirrors the deliveries hub's `?action=` convention: shareable,
 * survives a refresh, closes on submit (the server action's redirect drops it).
 */
export function NewTicketControl({
  categories,
  orders,
  defaultOrderId,
  defaultCategory,
}: {
  categories: readonly TicketCategoryValue[];
  orders: { value: string; label: string }[];
  defaultOrderId?: string;
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
      <Button variant="primary" onClick={openSheet}>
        <PlusIcon aria-hidden className="size-4" />
        New ticket
      </Button>
      <Sheet open={open} onClose={closeSheet} title="New ticket">
        <div className="px-4 py-3">
          <NewTicketForm
            categories={categories}
            orders={orders}
            defaultOrderId={defaultOrderId}
            defaultCategory={defaultCategory}
            onCancel={closeSheet}
          />
        </div>
      </Sheet>
    </>
  );
}

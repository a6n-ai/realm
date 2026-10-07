"use client";

import { PlusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Sheet } from "@/components/customer/kit";
import { isTicketCategory } from "@/lib/support/ticket-taxonomy";
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
  // Topic cards link to ?ticket=new&category=…, so the sheet opens with that topic picked.
  const urlOpen = searchParams.get("ticket") === "new";
  const urlCategory = searchParams.get("category");
  const topic = urlCategory && isTicketCategory(urlCategory) ? urlCategory : undefined;
  const [open, setOpen] = useState(urlOpen);
  useEffect(() => setOpen(urlOpen), [urlOpen]);

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
            key={topic ?? "any"}
            categories={categories}
            orders={orders}
            defaultOrderId={defaultOrderId}
            defaultCategory={topic ?? defaultCategory}
            onCancel={closeSheet}
          />
        </div>
      </Sheet>
    </>
  );
}

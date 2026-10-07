"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { ResponsiveDialog } from "@foundry/design-system";
import { isTicketCategory, type TicketCategoryValue } from "@/lib/support/ticket-taxonomy";
import { NewTicketForm } from "./new-ticket-form";
import { TopicCards } from "./topic-cards";

/**
 * Prominent "New ticket" CTA + optional topic shortcuts + the sheet they open.
 * `?ticket=new` survives refresh; closes on submit via the action's redirect.
 */
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
  const urlWantsOpen = searchParams.get("ticket") === "new";
  const urlCategory = searchParams.get("category");
  const fromUrl = urlCategory && isTicketCategory(urlCategory) ? urlCategory : undefined;

  const [open, setOpen] = useState(urlWantsOpen);
  const [category, setCategory] = useState<TicketCategoryValue | undefined>(fromUrl ?? defaultCategory);

  useEffect(() => {
    setOpen(urlWantsOpen);
    if (fromUrl) setCategory(fromUrl);
  }, [urlWantsOpen, fromUrl]);

  const openSheet = useCallback(
    (next?: TicketCategoryValue) => {
      setCategory(next ?? defaultCategory);
      setOpen(true);
      const q = new URLSearchParams();
      q.set("ticket", "new");
      if (next) q.set("category", next);
      else if (defaultCategory) q.set("category", defaultCategory);
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [router, pathname, defaultCategory],
  );

  const closeSheet = useCallback(() => {
    setOpen(false);
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  return (
    <>
      <div className="space-y-6">
        <button type="button" onClick={() => openSheet()} className="xl-support-new-ticket">
          <span className="xl-support-new-ticket-icon" aria-hidden>
            <PlusIcon className="size-5" strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-base font-extrabold tracking-tight">New ticket</span>
            <span className="mt-0.5 block text-sm leading-snug opacity-80">
              Start a chat with support — attach photos if it helps.
            </span>
          </span>
        </button>
        <TopicCards onPick={(c) => openSheet(c)} />
      </div>

      <ResponsiveDialog
        open={open}
        onOpenChange={(v) => (v ? openSheet(category) : closeSheet())}
        title="New ticket"
        direction="bottom"
      >
        <NewTicketForm
          key={category ?? "any"}
          categories={categories}
          bookings={bookings}
          defaultBookingId={defaultBookingId}
          defaultCategory={category}
          onCancel={closeSheet}
        />
      </ResponsiveDialog>
    </>
  );
}

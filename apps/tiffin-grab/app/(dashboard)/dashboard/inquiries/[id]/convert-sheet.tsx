"use client";

import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@realm/ui/sheet";
import type { ZoneLike } from "@/lib/catalog/postal";
import type { OrderFormInput } from "./order-schema";
import { OrderForm } from "./order/order-form";

type Catalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string; diet: string }[];
  frequencies: { key: string; name: string }[];
  durations: { weeks: number }[];
};

type EnabledSlot = { key: string; label: string };

export function ConvertSheet({
  inquiryId,
  contact,
  catalog,
  enabledSlots,
  zones,
  prefill,
  existing,
  open,
  onOpenChange,
  hideTrigger,
}: {
  inquiryId: string;
  contact: { fullName: string; phone: string; email: string };
  catalog: Catalog;
  enabledSlots: EnabledSlot[];
  zones: ZoneLike[];
  prefill?: Partial<OrderFormInput>;
  // Accepted for the page's context wiring; rendered as the "From the inquiry"
  // context header in the convert-sheet restyle task.
  unmatched?: string[];
  existing: { publicId: string; fullName: string } | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {hideTrigger ? null : (
        <SheetTrigger asChild>
          <Button>Create order</Button>
        </SheetTrigger>
      )}
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Order for {contact.fullName}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 p-4 pt-0">
          {existing ? (
            <div className="flex items-center gap-2 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
              <AlertTriangleIcon className="size-4 shrink-0 text-warn" />
              <span>
                Existing customer? {existing.fullName}{" "}
                <Link
                  href={`/dashboard/customers/${existing.publicId}`}
                  className="font-medium underline underline-offset-2"
                >
                  View profile
                </Link>
              </span>
            </div>
          ) : null}
          <OrderForm
            inquiryId={inquiryId}
            contact={contact}
            catalog={catalog}
            enabledSlots={enabledSlots}
            zones={zones}
            prefill={prefill}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  prefill,
  existing,
}: {
  inquiryId: string;
  contact: { fullName: string; phone: string; email: string };
  catalog: Catalog;
  enabledSlots: EnabledSlot[];
  prefill?: Partial<OrderFormInput>;
  existing: { publicId: string; fullName: string } | null;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Create order</Button>
      </SheetTrigger>
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
            prefill={prefill}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

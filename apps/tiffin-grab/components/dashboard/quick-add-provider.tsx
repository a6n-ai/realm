"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { NewOrderSheet } from "@/app/(dashboard)/dashboard/orders/new-order-sheet";
import { AddInquirySheet } from "@/app/(dashboard)/dashboard/inquiries/new-inquiry-form";
import { NewCustomerSheet } from "@/app/(dashboard)/dashboard/customers/new-customer-sheet";
import { loadQuickAddData, type QuickAddData } from "@/app/(dashboard)/dashboard/_leads/quick-add-data";

export type QuickAddKind = "order" | "inquiry" | "customer";

const QuickAddContext = createContext<((kind: QuickAddKind) => void) | null>(null);

/** Open a global add-popup from anywhere under the dashboard shell (e.g. the header search). */
export function useQuickAdd() {
  return useContext(QuickAddContext);
}

// Mounts the three add-popups once, at the shell level, so any descendant (the
// header search) can open them in place on any page. The form data (sources,
// catalog, zones) is fetched lazily on first open and cached — a normal page
// load pays nothing.
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [which, setWhich] = useState<QuickAddKind | null>(null);
  const [data, setData] = useState<QuickAddData | null>(null);
  const [loading, setLoading] = useState(false);

  const open = useCallback(
    async (kind: QuickAddKind) => {
      if (loading) return;
      if (data) {
        setWhich(kind);
        return;
      }
      setLoading(true);
      try {
        setData(await loadQuickAddData());
        setWhich(kind);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't load the form");
      } finally {
        setLoading(false);
      }
    },
    [data, loading],
  );

  const close = (o: boolean) => {
    if (!o) setWhich(null);
  };

  return (
    <QuickAddContext.Provider value={open}>
      {children}
      {data && (
        <>
          <NewOrderSheet
            open={which === "order"}
            onOpenChange={close}
            defaultCountry={data.defaultCountry}
            sources={data.sources}
            catalog={data.catalog}
            enabledSlots={data.enabledSlots}
            zones={data.zones}
          />
          <AddInquirySheet
            open={which === "inquiry"}
            onOpenChange={close}
            defaultCountry={data.defaultCountry}
            sources={data.sources}
            zones={data.zones}
          />
          <NewCustomerSheet
            open={which === "customer"}
            onOpenChange={close}
            defaultCountry={data.defaultCountry}
            sources={data.sources}
            catalog={data.catalog}
            enabledSlots={data.enabledSlots}
            zones={data.zones}
          />
        </>
      )}
    </QuickAddContext.Provider>
  );
}

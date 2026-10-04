"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { loadQuickAddData, type QuickAddData } from "@/app/(dashboard)/dashboard/_leads/quick-add-data";

// Lazy: these three forms (+ react-hook-form, zod, pricing, phone input) used to
// ship on every dashboard page although they only open on demand.
const importOrder = () => import("@/app/(dashboard)/dashboard/orders/new-order-sheet");
const importInquiry = () => import("@/app/(dashboard)/dashboard/inquiries/new-inquiry-form");
const importCustomer = () => import("@/app/(dashboard)/dashboard/customers/new-customer-sheet");
const NewOrderSheet = dynamic(() => importOrder().then((m) => m.NewOrderSheet), { ssr: false });
const AddInquirySheet = dynamic(() => importInquiry().then((m) => m.AddInquirySheet), { ssr: false });
const NewCustomerSheet = dynamic(() => importCustomer().then((m) => m.NewCustomerSheet), { ssr: false });

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
        // Fetch the form code alongside the data, not after it.
        const [d] = await Promise.all([loadQuickAddData(), importOrder(), importInquiry(), importCustomer()]);
        setData(d);
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
            categories={data.categories}
            currency={data.currency}
          />
          <AddInquirySheet
            open={which === "inquiry"}
            onOpenChange={close}
            defaultCountry={data.defaultCountry}
            sources={data.sources}
            zones={data.zones}
            catalog={data.catalog}
          />
          <NewCustomerSheet
            open={which === "customer"}
            onOpenChange={close}
            defaultCountry={data.defaultCountry}
            sources={data.sources}
            catalog={data.catalog}
            enabledSlots={data.enabledSlots}
          />
        </>
      )}
    </QuickAddContext.Provider>
  );
}

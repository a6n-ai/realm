import type { ReactNode } from "react";
import { CustomerBrand } from "@/components/customer/customer-brand";
import { CustomerNav } from "@/components/customer/customer-nav";
import { CustomerBottomNav } from "@/components/customer/customer-bottom-nav";

/**
 * /me chrome. The sidebar shell is admin-only. BottomNav hides itself at md, so the top
 * pills take over from md: on their own row until lg, then inline between brand and actions.
 */
export function CustomerShell({ actions, children }: { actions: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header
        data-customer-header
        className="bg-background/80 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] backdrop-blur-xl"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:pb-2 lg:h-16 lg:grid-cols-[1fr_auto_1fr] lg:px-6 lg:py-0">
          <CustomerBrand href="/me" />
          <CustomerNav />
          <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 lg:col-start-3">{actions}</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-10 lg:px-6 lg:pt-6">
        {children}
      </main>
      <CustomerBottomNav />
    </div>
  );
}

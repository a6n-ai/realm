import type { ReactNode } from "react";
import { CustomerBrand } from "@/components/customer/customer-brand";
import { CustomerNav } from "@/components/customer/customer-nav";
import { CustomerBottomNav } from "@/components/customer/customer-bottom-nav";

/** /me chrome: top bar on desktop, bottom nav on phones. The sidebar shell is admin-only. */
export function CustomerShell({ actions, children }: { actions: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header
        data-customer-header
        className="bg-background/80 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] backdrop-blur-xl"
      >
        <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto] items-center gap-3 px-4 lg:grid-cols-[1fr_auto_1fr] lg:px-6">
          <CustomerBrand href="/me" />
          <CustomerNav />
          <div className="flex items-center justify-end gap-1">{actions}</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:px-6 lg:pt-6 lg:pb-10">
        {children}
      </main>
      <div className="lg:hidden">
        <CustomerBottomNav />
      </div>
    </div>
  );
}

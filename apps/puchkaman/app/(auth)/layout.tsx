import type { ReactNode } from "react";
import { TooltipProvider } from "@foundry/ui/tooltip";
import { AuthNav } from "./auth-nav";

/** Admin auth — CRM shell + shared auth composition (same pattern as tiffin-grab). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="crm-app">
      <TooltipProvider>
        {/* Phones: the panel fills the screen under the nav (welcome actions in
            thumb reach at the bottom). sm+: a centered card. */}
        <main className="bg-muted relative flex min-h-svh flex-col items-center justify-center px-6 pt-20 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-10">
          <AuthNav />
          <div className="flex w-full max-w-sm flex-1 flex-col justify-center sm:flex-none md:max-w-3xl">{children}</div>
        </main>
      </TooltipProvider>
    </div>
  );
}

import type { ReactNode } from "react";
import { TooltipProvider } from "@foundry/ui/tooltip";
import { AuthNav } from "./auth-nav";

/** Admin auth — CRM shell + shared auth composition (same pattern as tiffin-grab). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="crm-app">
      <TooltipProvider>
        <main className="bg-muted relative flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
          <AuthNav />
          <div className="w-full max-w-sm md:max-w-3xl">{children}</div>
        </main>
      </TooltipProvider>
    </div>
  );
}

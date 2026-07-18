"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard/products": "Products",
};

export function AdminShell({ user, children }: { user: { email: string }; children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Route changes (e.g. after a save's router.refresh, or navigating) should
  // close the mobile drawer rather than leaving it stuck open.
  useEffect(() => setMobileOpen(false), [pathname]);

  const title = PAGE_TITLES[pathname] ?? "Dashboard";

  return (
    <div className="admin-shell">
      <AdminSidebar
        user={user}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="admin-main">
        <AdminTopbar title={title} breadcrumb="Admin" user={user} onOpenMobileSidebar={() => setMobileOpen(true)} />
        <main className="admin-content">{children}</main>
      </div>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            border: "var(--border)",
            borderRadius: "var(--r-sm)",
            boxShadow: "var(--sh-sm)",
            background: "var(--white)",
            color: "var(--ink)",
            fontFamily: "var(--font)",
            fontWeight: 600,
          },
        }}
      />
    </div>
  );
}

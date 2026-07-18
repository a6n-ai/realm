"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsLeftIcon, ChevronsRightIcon, LogOutIcon, UtensilsCrossedIcon, XIcon, type LucideIcon } from "lucide-react";
import { signOut } from "@/lib/auth/client";

export type AdminNavItem = { title: string; href: string; icon: LucideIcon };

const NAV: AdminNavItem[] = [{ title: "Products", href: "/dashboard/products", icon: UtensilsCrossedIcon }];

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/dashboard/products"
      aria-label="Puchkaman admin home"
      style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "18px 16px" }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: "var(--red)",
          border: "3px solid var(--yellow)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--yellow)" }} />
      </span>
      {!collapsed && (
        <span style={{ lineHeight: 1.1, overflow: "hidden" }}>
          <span className="display" style={{ display: "block", fontSize: "1.05rem", color: "var(--yellow)", whiteSpace: "nowrap" }}>
            PUCHKAMAN
          </span>
          <span className="mono" style={{ display: "block", fontSize: "0.68rem", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Admin
          </span>
        </span>
      )}
    </Link>
  );
}

export function AdminSidebar({
  user,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: {
  user: { email: string };
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const body = (
    <aside className={`admin-sidebar ${collapsed ? "admin-sidebar--collapsed" : ""} ${mobileOpen ? "is-open" : ""}`}>
      <div className="flex between center" style={{ borderBottom: "2px solid rgba(255,244,218,.15)" }}>
        <Logo collapsed={collapsed} />
        <button className="icon-btn admin-sidebar-close" style={{ marginRight: 14 }} onClick={onCloseMobile} aria-label="Close menu">
          <XIcon size={16} />
        </button>
      </div>

      <nav style={{ flex: 1, padding: "14px 0", overflowY: "auto" }}>
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`admin-nav-link ${active ? "is-active" : ""}`} title={collapsed ? item.title : undefined}>
              <item.icon size={18} strokeWidth={2.4} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      <div style={{ borderTop: "2px solid rgba(255,244,218,.15)", padding: "12px 14px", display: "grid", gap: 10 }}>
        <button
          onClick={onToggleCollapsed}
          className="admin-nav-link"
          style={{ width: "100%", justifyContent: collapsed ? "center" : "flex-start" }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRightIcon size={18} /> : <ChevronsLeftIcon size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
        {!collapsed && (
          <div className="mono" style={{ fontSize: "0.72rem", opacity: 0.65, padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.email}
          </div>
        )}
        <button
          onClick={() => void signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })}
          className="admin-nav-link"
          style={{ width: "100%", justifyContent: collapsed ? "center" : "flex-start", color: "var(--red)" }}
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOutIcon size={18} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {mobileOpen && <div className="admin-sidebar-backdrop" onClick={onCloseMobile} aria-hidden="true" />}
      {body}
    </>
  );
}

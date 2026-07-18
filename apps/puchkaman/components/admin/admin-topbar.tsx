"use client";

import { DropdownMenu } from "radix-ui";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOutIcon, MenuIcon, UserIcon } from "lucide-react";
import { signOut } from "@/lib/auth/client";

export function AdminTopbar({
  title,
  breadcrumb,
  user,
  onOpenMobileSidebar,
}: {
  title: string;
  breadcrumb?: string;
  user: { email: string };
  onOpenMobileSidebar: () => void;
}) {
  const router = useRouter();
  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <header className="admin-topbar">
      <div className="flex between center" style={{ height: 62, padding: "0 18px" }}>
        <div className="flex center" style={{ gap: 12, minWidth: 0 }}>
          <button className="icon-btn admin-sidebar-close" onClick={onOpenMobileSidebar} aria-label="Open menu">
            <MenuIcon size={16} />
          </button>
          <div style={{ minWidth: 0 }}>
            {breadcrumb && (
              <div className="mono" style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55 }}>
                {breadcrumb}
              </div>
            )}
            <h1 className="display" style={{ fontSize: "1.3rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {title}
            </h1>
          </div>
        </div>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="flex center"
              style={{
                gap: 8,
                padding: "6px 10px 6px 6px",
                border: "2px solid var(--ink)",
                borderRadius: 999,
                background: "var(--white)",
                boxShadow: "2px 2px 0 var(--ink)",
                flexShrink: 0,
              }}
              aria-label="Admin account menu"
            >
              <span
                className="mono"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--yellow)",
                  border: "2px solid var(--ink)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                }}
              >
                {initials}
              </span>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, display: "none" }} className="admin-topbar-email">
                {user.email}
              </span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="card"
              style={{ minWidth: 220, padding: 8, background: "var(--white)", zIndex: 60 }}
            >
              <div className="mono" style={{ padding: "8px 10px", fontSize: "0.72rem", opacity: 0.6, wordBreak: "break-all" }}>
                {user.email}
              </div>
              <DropdownMenu.Separator style={{ height: 2, background: "var(--ink)", opacity: 0.1, margin: "4px 0" }} />
              <DropdownMenu.Item asChild>
                <Link
                  href="/dashboard/products"
                  className="flex center"
                  style={{ gap: 8, padding: "9px 10px", borderRadius: 8, fontSize: "0.86rem", fontWeight: 700, cursor: "pointer", outline: "none" }}
                >
                  <UserIcon size={15} /> Products
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => void signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })}
                className="flex center"
                style={{ gap: 8, padding: "9px 10px", borderRadius: 8, fontSize: "0.86rem", fontWeight: 700, color: "var(--red)", cursor: "pointer", outline: "none" }}
              >
                <LogOutIcon size={15} /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
